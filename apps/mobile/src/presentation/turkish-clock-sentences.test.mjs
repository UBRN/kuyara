import assert from 'node:assert/strict';
import test from 'node:test';

import { todayScreenState } from '../features/today/__tests__/fixtures.ts';
import {
  askAgainWarning,
  createTodayPresentation,
  eveningLaterReadyLine,
} from '../features/today/presentation/today-presentation.ts';
import { hourlyRailColumns } from '../features/weather/presentation/hourly-rail-columns.ts';
import { messages } from '../localization/messages.ts';
import {
  formatLastUpdated,
  formatNaturalClockTime,
  formatSpokenClockTime,
  formatWallClockTime,
} from './format-clock-time.ts';

// Inside the app a Turkish sentence on a 12-hour clock names the part of the day ("akşam
// 7:00") where the clock prints the abbreviation ("ÖS 7:00"). The 24-hour form and English
// stay as they were. These assertions cover each sentence that embeds a time.
const abbreviation = /(^|[\s(])Ö[ÖS]\s\d/u;
const tr = messages.tr;

test('a fixed wall-clock time takes the formatter a sentence needs', () => {
  const quietStart = { hour: 22, minute: 0 };
  const briefing = { hour: 7, minute: 0 };

  assert.equal(formatWallClockTime(quietStart, 'tr', true, formatNaturalClockTime), 'gece 10:00');
  assert.equal(formatWallClockTime(briefing, 'tr', true, formatSpokenClockTime), 'sabah saat 7:00');
  assert.equal(formatWallClockTime(briefing, 'tr', false, formatSpokenClockTime), 'saat 07:00');
  assert.equal(formatWallClockTime(quietStart, 'tr', false, formatNaturalClockTime), '22:00');
  assert.equal(formatWallClockTime(quietStart, 'en', true, formatNaturalClockTime), '10:00 pm');
  assert.equal(formatWallClockTime(briefing, 'en', true), '7:00 am');
});

test('last updated says the part of the day in Turkish on a 12-hour clock', () => {
  const now = Date.parse('2026-10-04T13:20:00Z');
  const today = '2026-10-04T13:05:00.000Z';
  const earlier = '2026-10-02T13:05:00.000Z';
  const naturalToday = formatNaturalClockTime(today, 'tr', true);
  const naturalEarlier = formatNaturalClockTime(earlier, 'tr', true);

  assert.equal(formatLastUpdated(today, 'tr', true, now), naturalToday);
  assert.ok(formatLastUpdated(earlier, 'tr', true, now).endsWith(` ${naturalEarlier}`));
  assert.ok(formatLastUpdated(earlier, 'tr', true, now).includes('2026'));
  assert.doesNotMatch(formatLastUpdated(earlier, 'tr', true, now), abbreviation);
  // 24-hour and English keep the clock's own form.
  assert.match(formatLastUpdated(today, 'tr', false, now), /^\d{2}:\d{2}$/u);
  assert.match(formatLastUpdated(today, 'en', true, now), /\d:\d{2}\s?pm$/iu);
});

test('Turkish notification-settings sentences read the time naturally', () => {
  const copy = tr.notifications;

  assert.equal(copy.quietHoursHint({ start: 'gece 10:00', end: 'sabah 7:00' }),
    'Gece 10:00 ile sabah 7:00 arasında uyarı gönderilmez.');
  assert.equal(copy.quietHoursHint({ start: '22:00', end: '07:00' }),
    '22:00 ile 07:00 arasında uyarı gönderilmez.');
  assert.equal(copy.offer.morningBriefingSentence('sabah saat 7:00'),
    'Sabah özeti (sabah saat 7:00) ve hava uyarıları.');
  assert.equal(copy.offer.morningBriefingSentence('saat 07:00'), 'Sabah özeti (saat 07:00) ve hava uyarıları.');
  assert.match(copy.morningBriefing.hint('sabah saat 7:00'), /\(sabah saat 7:00\)\./u);
  assert.match(copy.morningBriefing.hint('saat 07:00'), /\(saat 07:00\)\./u);
});

test('Turkish outlook and insight sentences read the time naturally, 24-hour stays', () => {
  assert.equal(tr.weather.outlook.temperatureDrop({ time: 'akşam saat 5:00', degrees: '4°' }),
    'Akşam saat 5:00 civarında 4° daha serin');
  assert.equal(tr.weather.outlook.temperatureDrop({ time: 'saat 17:00', degrees: '4°' }),
    'Saat 17:00 civarında 4° daha serin');
  assert.equal(tr.weather.outlook.rainStarting('akşam 5:00'), 'Yağmur akşam 5:00 civarında başlıyor');
  assert.equal(tr.weather.outlook.rainStarting('17:00'), 'Yağmur 17:00 civarında başlıyor');
  const insight = tr.today.dayInsight;
  assert.equal(insight.hot('akşam saat 5:00'), 'Akşam saat 5:00 civarında hava ısınıyor.');
  assert.equal(insight.hot('saat 17:00'), 'Saat 17:00 civarında hava ısınıyor.');
  assert.equal(insight.rainFrom('akşam 5:00'), 'Yağmur akşam 5:00 civarında başlıyor.');
  assert.equal(tr.today.drift.rain('akşam saat 5:00'),
    'Bu kombin, akşam saat 5:00 civarındaki yağmura göre seçilmedi.');
  assert.equal(tr.today.drift.rain('saat 17:00'), 'Bu kombin, saat 17:00 civarındaki yağmura göre seçilmedi.');
  assert.equal(tr.today.coolSpell('akşam saat 5:00'), 'Yanına ince bir kat al, akşam saat 5:00 gibi hava serinliyor.');
  assert.equal(tr.today.coolSpell('saat 17:00'), 'Yanına ince bir kat al, saat 17:00 gibi hava serinliyor.');
});

test('Turkish coverage and choice sentences read the time naturally', () => {
  const coverage = tr.today.coverage;

  assert.equal(coverage.chosen('öğleden sonra 3:00', 'akşam 9:00'),
    'Öğleden sonra 3:00 ile akşam 9:00 arasındaki havaya göre seçildi.');
  assert.equal(coverage.chosen('15:00', '21:00'), '15:00 ile 21:00 arasındaki havaya göre seçildi.');
  assert.equal(coverage.choosingOnDay('Cuma', 'sabah 9:00', 'sabah 11:00'),
    'Cuma, sabah 9:00 ile sabah 11:00 arasındaki havaya göre seçiliyor…');
  assert.equal(tr.today.askAgain.chooseAt('akşam 7:00'), 'Akşam 7:00 için seç');
  assert.equal(tr.today.askAgain.chooseAt('19:00'), '19:00 için seç');
});

test('the Turkish hourly forecast label says the part of the day on a 12-hour clock', () => {
  const hours = [0, 1].map((offset) => ({
    forecastAt: new Date(Date.parse('2026-10-03T12:00:00.000Z') + offset * 3_600_000).toISOString(),
    temperatureCelsius: 17, apparentTemperatureCelsius: 16, condition: 'clear',
    precipitationProbability: 0, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  }));
  const columnsFor = (language, hour12) => hourlyRailColumns(
    { timeZone: 'Europe/Istanbul', hourly: hours },
    Date.parse('2026-10-03T11:30:00.000Z'),
    undefined,
    { copy: messages[language].weather, hour12, language, temperatureUnit: 'celsius', unitName: 'santigrat derece' },
  );

  // The first column is the one the rail marks Now, and it is spoken that way.
  assert.match(columnsFor('tr', true)[0].accessibilityLabel, /^Şimdi, öğleden sonra saat 3:00\. Sıcaklık /u);
  assert.match(columnsFor('tr', true)[1].accessibilityLabel, /^Öğleden sonra saat 4:00\. /u);
  assert.match(columnsFor('tr', false)[0].accessibilityLabel, /^Şimdi, saat 15:00\. Sıcaklık /u);
  assert.match(columnsFor('tr', false)[1].accessibilityLabel, /^Saat 16:00\. Sıcaklık /u);
  assert.match(columnsFor('en', true)[0].accessibilityLabel, /^Now, 3:00 pm\. /u);
  assert.match(columnsFor('en', true)[1].accessibilityLabel, /^4:00 pm\. /u);
  // The rail column itself is a standalone label and keeps the clock's own form.
  assert.match(columnsFor('tr', true)[1].time, /^ÖS 4:00$/u);
});

test('Today lines in Turkish on a 12-hour clock never print the abbreviation', () => {
  const departure = {
    dayKey: '2026-08-13:evening', timeZone: 'Europe/Istanbul',
    departureAt: '2026-08-13T16:00:00.000Z',
    createdAt: '2026-08-13T14:00:00.000Z',
    updatedAt: '2026-08-13T15:00:00.000Z',
  };
  const now = Date.parse('2026-08-13T15:30:00.000Z');

  assert.equal(eveningLaterReadyLine(departure, now, 'tr', true),
    'Akşam 7:00 için kombinin akşam saat 6:00 itibarıyla hazır');
  assert.equal(eveningLaterReadyLine(departure, now, 'tr', false),
    '19:00 için kombinin saat 18:00 itibarıyla hazır');

  const window = { start: '2026-08-13T11:00:00.000Z', end: '2026-08-13T16:00:00.000Z' };
  assert.equal(askAgainWarning(window, Date.parse('2026-08-13T06:30:00.000Z'), 'Europe/Istanbul', 'tr', true),
    'kuyara, öğleden sonra 2:00 ile akşam 7:00 arasındaki havaya göre yeniden seçecek. Ekrandaki kombinlerin yerine yenileri gelecek.');
  assert.equal(askAgainWarning(window, Date.parse('2026-08-13T06:30:00.000Z'), 'Europe/Istanbul', 'tr', false),
    'kuyara, 14:00 ile 19:00 arasındaki havaya göre yeniden seçecek. Ekrandaki kombinlerin yerine yenileri gelecek.');

  const covered = {
    ...todayScreenState,
    isRefreshing: false,
    refreshFailed: false,
    snapshot: {
      ...todayScreenState.snapshot,
      coverageStart: '2026-08-13T05:00:00.000Z',
      coverageEnd: '2026-08-13T08:00:00.000Z',
    },
  };
  const presentation = createTodayPresentation(covered, 'tr', true, 'celsius', Date.parse('2026-08-13T06:30:00.000Z'));
  assert.equal(presentation.kind, 'loaded');
  assert.doesNotMatch(presentation.header.freshness, abbreviation);
  assert.match(presentation.header.freshness, /^Son güncelleme (sabah|öğle|öğleden sonra|akşam|gece) \d/u);
  assert.match(presentation.coverageCaption ?? '', /^Sabah 8:00 ile (sabah|öğle) \d+:00 arasındaki havaya göre seçildi\.$/u);
  assert.doesNotMatch(presentation.coverageCaption ?? '', abbreviation);
});
