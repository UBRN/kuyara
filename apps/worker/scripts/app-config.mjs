// Turns a remote app switch on or off in the production APP_CONFIG namespace, or prints it
// (ADR 0042 section 7). Run from the repository root:
//   pnpm --filter @kuyara/worker app-config siri-card off|on|status
// Wrangler must be logged in to the account. An absent or malformed key makes devices keep their
// last answer, so the switch is always written explicitly, never deleted.
import { spawnSync } from 'node:child_process';

const [name, action] = process.argv.slice(2);
if (name !== 'siri-card' || !['on', 'off', 'status'].includes(action)) {
  console.error('usage: pnpm --filter @kuyara/worker app-config siri-card on|off|status');
  process.exit(2);
}
const target = ['--binding=APP_CONFIG', '--remote', '--env='];
const args = action === 'status'
  ? ['kv', 'key', 'get', 'siri-card', '--text', ...target]
  : ['kv', 'key', 'put', 'siri-card', action, ...target];
const { status } = spawnSync('wrangler', args, { stdio: 'inherit' });
if (status === 0 && action !== 'status') {
  console.log('A device applies the new value at its next check (at most every 4 hours, while the app is opened).');
}
process.exit(status ?? 1);
