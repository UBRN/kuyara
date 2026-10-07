import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type {
  SyncConsentAnswerInput,
  SyncConsentPort,
} from '@/features/account/application/account-session';
import type { AccountRemotePort, PulledAccountRows } from '@/features/account/application/account-sync';
import {
  fromRemoteDressingDayChoice,
  fromRemoteDressingDayDeparture,
  fromRemoteOutfitHistory,
  fromRemoteProfile,
  fromRemoteWardrobeItem,
  toRemoteDressingDayChoice,
  toRemoteDressingDayDeparture,
  toRemoteOutfitHistory,
  toRemoteProfile,
  toRemoteWardrobeItem,
  type RemoteRowResult,
} from '@/features/account/data/account-remote-mappers';
import { serverInstant } from '@/features/account/data/account-remote-records';
import type { AccountRows } from '@/features/account/domain/account-rows';
import { serverInstantSecondsBefore } from '@/features/account/domain/server-instant';
import {
  nextCursor,
  pullCursorAt,
  type AccountTable,
  type PullArrival,
  type PullCursor,
  type PulledSyncRow,
} from '@/features/account/domain/sync-rules';
import type { SyncConsentAnswer } from '@/features/account/domain/sync-consent';
import { offsetIsoInstantSchema } from '@/domain/record-identity';

/**
 * A closed failure of an account request: the request failed or its answer did not parse. It
 * carries no Supabase message, row, token or identifier.
 */
export class AccountRemoteError extends Error {
  readonly code: 'request' | 'response';

  constructor(code: 'request' | 'response') {
    super(code === 'request' ? 'The account request failed.' : 'The account answer was not readable.');
    this.name = 'AccountRemoteError';
    this.code = code;
  }
}

/**
 * How far before the cursor each pull starts again. `server_updated_at` is `now()`, the start
 * of the writing transaction, so a transaction that commits after a pull has read past its
 * stamp would otherwise be missed for good. Every account write is one PostgREST request, one
 * transaction, and Supabase stops an `authenticated` statement after 8 seconds by default, so
 * no row can commit later than 8 seconds after its stamp; 10 seconds covers that with margin.
 * Rows read again land idempotently: a settled row is rewritten with the same values and the
 * cursor never moves back.
 */
export const pullOverlapSeconds = 10;

/** PostgREST answers at most 1000 rows per request on Supabase by default; a pull pages under it. */
const pageSize = 500;
/** Upserts go in batches, so a first upload of a large Closet stays well inside the statement limit. */
const uploadBatchSize = 200;

type RecordTable = 'wardrobe_items' | 'dressing_day_choices' | 'dressing_day_departures' | 'outfit_history';

const ackSchema = z.object({ id: z.string(), day_key: z.string().optional(), updated_at: offsetIsoInstantSchema });
const profileAckSchema = z.object({ updated_at: offsetIsoInstantSchema });
const pageRowSchema = z.object({ id: z.string(), server_updated_at: z.string() });
/** The identity a refused row still names, when it names one. */
const refusedKeySchema = z.object({ id: z.string(), day_key: z.string().optional() });
const consentRecordsSchema = z.array(z.object({
  text_version: z.string(),
  answer: z.enum(['given', 'withdrawn'] as const satisfies readonly SyncConsentAnswer[]),
  answered_at: offsetIsoInstantSchema,
  recorded_at: serverInstant,
}));

type Result = Readonly<{ data: unknown; error: unknown }>;

function dataOf(result: Result): unknown {
  if (result.error !== null && result.error !== undefined) throw new AccountRemoteError('request');
  return result.data;
}

function parsed<Value>(schema: z.ZodType<Value>, value: unknown): Value {
  const result = schema.safeParse(value);
  if (!result.success) throw new AccountRemoteError('response');
  return result.data;
}

const sameInstant = (left: string, right: string) => Date.parse(left) === Date.parse(right);

/** PostgREST reads `.`, `,`, `:` and parentheses as syntax inside `or`, so a value is quoted. */
const quoted = (value: string) => `"${value.replaceAll('"', '')}"`;

/** `patch` over no rows at all: one confirmed batch of one table. */
const only = (patch: Partial<AccountRows>): AccountRows => ({
  profile: null, wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [], ...patch,
});

function chunks<Item>(items: readonly Item[]): Item[][] {
  const out: Item[][] = [];
  for (let start = 0; start < items.length; start += uploadBatchSize) out.push(items.slice(start, start + uploadBatchSize));
  return out;
}

export function createSupabaseAccountRemote(client: SupabaseClient, localProfileId: string): AccountRemotePort {
  /**
   * Every row of one table the user owns from `from` on, in arrival order. Pages are keyed on
   * `(server_updated_at, id)`, so rows that share one transaction's stamp are neither skipped
   * nor repeated, and a row rewritten while the pages are read moves past the last key instead
   * of shifting the pages under it.
   */
  async function readTable(table: RecordTable, userId: string, from: string | null): Promise<unknown[]> {
    const rows: unknown[] = [];
    let after: Readonly<{ at: string; id: string }> | null = null;
    for (;;) {
      let query = client.from(table).select('*').eq('user_id', userId);
      if (after !== null) {
        query = query.or(`server_updated_at.gt.${quoted(after.at)},`
          + `and(server_updated_at.eq.${quoted(after.at)},id.gt.${quoted(after.id)})`);
      } else if (from !== null) {
        query = query.gte('server_updated_at', from);
      }
      const page = parsed(z.array(z.unknown()), dataOf(
        await query.order('server_updated_at', { ascending: true }).order('id', { ascending: true }).limit(pageSize),
      ));
      rows.push(...page);
      if (page.length < pageSize) return rows;
      const last = parsed(pageRowSchema, page.at(-1));
      after = { at: last.server_updated_at, id: last.id };
    }
  }

  async function readProfile(userId: string, from: string | null): Promise<unknown[]> {
    let query = client.from('profiles').select('*').eq('user_id', userId);
    if (from !== null) query = query.gte('server_updated_at', from);
    return parsed(z.array(z.unknown()), dataOf(await query));
  }

  /**
   * Every table from its own position in `cursor`, moved back by the overlap; every row when the
   * table has none. Each row the parsers refuse goes to `onRefused` when the caller asks.
   */
  async function pullFrom(
    userId: string, cursor: PullCursor, syncConsent: boolean,
    onRefused?: (table: AccountTable, raw: unknown) => void,
  ): Promise<PulledAccountRows> {
    const arrivals: PullArrival[] = [];
    function accepted<Row>(
      table: AccountTable, raws: readonly unknown[], map: (raw: unknown) => RemoteRowResult<Row>,
    ): PulledSyncRow<Row>[] {
      const rows: PulledSyncRow<Row>[] = [];
      for (const raw of raws) {
        const result = map(raw);
        arrivals.push({ table, serverUpdatedAt: result.serverUpdatedAt });
        if (result.kind === 'accepted') rows.push({ row: result.row, serverUpdatedAt: result.serverUpdatedAt });
        else onRefused?.(table, raw);
      }
      return rows;
    }
    const from = (table: AccountTable) => {
      const position = cursor[table];
      return position === null ? null : serverInstantSecondsBefore(position, pullOverlapSeconds);
    };
    const records = async (table: RecordTable, key: AccountTable) => (syncConsent ? readTable(table, userId, from(key)) : []);
    const [profiles, wardrobeItems, dressingDayChoices, dressingDayDepartures, outfitHistory] = await Promise.all([
      readProfile(userId, from('profile')),
      records('wardrobe_items', 'wardrobeItems'),
      records('dressing_day_choices', 'dressingDayChoices'),
      records('dressing_day_departures', 'dressingDayDepartures'),
      records('outfit_history', 'outfitHistory'),
    ]);
    return {
      profile: accepted('profile', profiles, fromRemoteProfile).at(-1)?.row ?? null,
      wardrobeItems: accepted('wardrobeItems', wardrobeItems, (raw) => fromRemoteWardrobeItem(raw, localProfileId)),
      dressingDayChoices: accepted('dressingDayChoices', dressingDayChoices, (raw) => fromRemoteDressingDayChoice(raw, localProfileId)),
      dressingDayDepartures: accepted('dressingDayDepartures', dressingDayDepartures,
        (raw) => fromRemoteDressingDayDeparture(raw, localProfileId)),
      outfitHistory: accepted('outfitHistory', outfitHistory, (raw) => fromRemoteOutfitHistory(raw, localProfileId)),
      arrivals,
    };
  }

  /**
   * Upserts `rows` in batches and hands each batch's rows the account acknowledged at the version
   * sent (the same identity, the day for day-keyed tables, and the same `updated_at`) to
   * `confirm` before the next batch goes. A row is keyed within its user, so the same UUID
   * uploads to a second account without touching the first one's copy.
   */
  async function upsert<Row extends Readonly<{ id: string; updatedAt: string; dayKey?: string }>>(
    table: RecordTable,
    rows: readonly Row[],
    toRemote: (row: Row) => object,
    byDay: boolean,
    confirm: (acknowledged: Row[]) => Promise<void>,
  ): Promise<void> {
    for (const batch of chunks(rows)) {
      const acks = parsed(z.array(ackSchema), dataOf(await client.from(table)
        .upsert(batch.map(toRemote), { onConflict: byDay ? 'user_id,day_key' : 'user_id,id' })
        .select(byDay ? 'id, day_key, updated_at' : 'id, updated_at')));
      const ackAt = new Map(acks.map((ack) => [byDay ? ack.day_key : ack.id, ack.updated_at]));
      await confirm(batch.filter((row) => {
        const at = ackAt.get(byDay ? row.dayKey : row.id);
        return at !== undefined && sameInstant(at, row.updatedAt);
      }));
    }
  }

  return {
    async pullSnapshot(userId, syncConsent) {
      // What the parsers refused, so a first link sends nothing over it: the profile, the Closet
      // and History by id and the days by day.
      const refused = { profile: false, wardrobeItems: [] as string[], dressingDayChoices: [] as string[],
        dressingDayDepartures: [] as string[], outfitHistory: [] as string[] };
      const pulled = await pullFrom(userId, pullCursorAt(null), syncConsent, (table, raw) => {
        if (table === 'profile') { refused.profile = true; return; }
        const key = refusedKeySchema.safeParse(raw);
        const byDay = table === 'dressingDayChoices' || table === 'dressingDayDepartures';
        const identity = key.success ? (byDay ? key.data.day_key : key.data.id) : undefined;
        if (identity !== undefined) refused[table].push(identity);
      });
      const rows = <Row>(entries: readonly PulledSyncRow<Row>[]) => entries.map(({ row }) => row);
      return {
        rows: {
          profile: pulled.profile,
          wardrobeItems: rows(pulled.wardrobeItems),
          dressingDayChoices: rows(pulled.dressingDayChoices),
          dressingDayDepartures: rows(pulled.dressingDayDepartures),
          outfitHistory: rows(pulled.outfitHistory),
        },
        cursor: nextCursor(pullCursorAt(null), pulled.arrivals),
        refused,
      };
    },
    pull: (userId, cursor, syncConsent) => pullFrom(userId, cursor, syncConsent),
    async upload(userId, rows, confirm) {
      const { profile } = rows;
      if (profile !== null) {
        const ack = parsed(z.array(profileAckSchema), dataOf(await client.from('profiles')
          .upsert(toRemoteProfile(profile, userId), { onConflict: 'user_id' })
          .select('updated_at')));
        if (ack.some(({ updated_at: at }) => sameInstant(at, profile.updatedAt))) await confirm(only({ profile }));
      }
      await upsert('wardrobe_items', rows.wardrobeItems, (row) => toRemoteWardrobeItem(row, userId), false,
        (wardrobeItems) => confirm(only({ wardrobeItems })));
      await upsert('dressing_day_choices', rows.dressingDayChoices, (row) => toRemoteDressingDayChoice(row, userId), true,
        (dressingDayChoices) => confirm(only({ dressingDayChoices })));
      await upsert('dressing_day_departures', rows.dressingDayDepartures, (row) => toRemoteDressingDayDeparture(row, userId), true,
        (dressingDayDepartures) => confirm(only({ dressingDayDepartures })));
      await upsert('outfit_history', rows.outfitHistory, (row) => toRemoteOutfitHistory(row, userId), false,
        (outfitHistory) => confirm(only({ outfitHistory })));
    },
  };
}

/** The sync consent records of ADR 0041 section 10 over `sync_consent_records`. */
export function createSupabaseSyncConsent(client: SupabaseClient): SyncConsentPort {
  return {
    async records(userId) {
      const rows = parsed(consentRecordsSchema, dataOf(await client.from('sync_consent_records')
        .select('text_version, answer, answered_at, recorded_at')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: true })
        .order('id', { ascending: true })));
      return rows.map((row) => ({
        textVersion: row.text_version, answer: row.answer, answeredAt: row.answered_at, recordedAt: row.recorded_at,
      }));
    },
    async give(userId, answer: SyncConsentAnswerInput) {
      dataOf(await client.from('sync_consent_records').insert({
        user_id: userId, text_version: answer.textVersion, answer: 'given', answered_at: answer.answeredAt,
      }));
    },
    async withdraw(answer) {
      dataOf(await client.rpc('withdraw_sync_consent', {
        p_text_version: answer.textVersion, p_answered_at: answer.answeredAt,
      }));
    },
  };
}
