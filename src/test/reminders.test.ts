import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseReminderTime } from '../reminders/manager.js';

describe('parseReminderTime', () => {
  it('"30m" returns ~30 minutes from now', () => {
    const before = Date.now();
    const result = parseReminderTime('30m');
    const after = Date.now();
    const expected = 30 * 60 * 1000;
    assert.ok(result.getTime() - before >= expected - 50);
    assert.ok(result.getTime() - after <= expected + 50);
  });

  it('"2h" returns ~2 hours from now', () => {
    const before = Date.now();
    const result = parseReminderTime('2h');
    const expected = 2 * 60 * 60 * 1000;
    assert.ok(Math.abs(result.getTime() - before - expected) < 100);
  });

  it('"1d" returns ~1 day from now', () => {
    const before = Date.now();
    const result = parseReminderTime('1d');
    const expected = 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(result.getTime() - before - expected) < 100);
  });

  it('"morgen" returns tomorrow at 9:00', () => {
    const result = parseReminderTime('morgen');
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    assert.strictEqual(result.getTime(), tomorrow.getTime());
  });

  it('"morgen 14:00" returns tomorrow at 14:00', () => {
    const result = parseReminderTime('morgen 14:00');
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    assert.strictEqual(result.getTime(), tomorrow.getTime());
  });

  it('"tomorrow 9:00" returns tomorrow at 9:00', () => {
    const result = parseReminderTime('tomorrow 9:00');
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    assert.strictEqual(result.getTime(), tomorrow.getTime());
  });

  it('ISO date string works', () => {
    const result = parseReminderTime('2030-06-15T10:30:00.000Z');
    assert.strictEqual(result.toISOString(), '2030-06-15T10:30:00.000Z');
  });

  it('invalid input throws', () => {
    assert.throws(() => parseReminderTime('not-a-date'), {
      message: /Cannot parse reminder time/,
    });
  });
});
