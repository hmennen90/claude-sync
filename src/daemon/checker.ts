import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadLocalConfig, getConfigDir } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';
import { ReminderManager, type Reminder } from '../reminders/manager.js';

const LOG_PATH = path.join(getConfigDir(), 'daemon.log');

async function log(message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, line);
}

async function fireWebhook(reminder: Reminder): Promise<boolean> {
  if (!reminder.webhook) return false;

  try {
    const response = await fetch(reminder.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: reminder.message,
        dueAt: reminder.dueAt,
        username: reminder.username,
        id: reminder.id,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      await log(`Webhook failed for reminder ${reminder.id}: HTTP ${response.status}`);
      return false;
    }

    return true;
  } catch (err: any) {
    await log(`Webhook error for reminder ${reminder.id}: ${err.message}`);
    return false;
  }
}

/**
 * Run a single check: pull repo, find due reminders with webhooks, fire them.
 * Returns the number of webhooks fired.
 */
export async function runCheck(): Promise<number> {
  const localConfig = await loadLocalConfig();
  if (!localConfig) {
    await log('Not initialized — skipping check.');
    return 0;
  }

  const key = await retrieveKey(localConfig.repoUrl);
  if (!key) {
    await log('Encryption key not found in keychain — skipping check.');
    return 0;
  }

  const sync = new GitSync({
    repoUrl: localConfig.repoUrl,
    localPath: localConfig.localPath,
    deviceId: localConfig.deviceId,
  });

  try {
    await sync.pull();
  } catch (err: any) {
    await log(`Git pull failed: ${err.message}`);
    return 0;
  }

  const manager = new ReminderManager(sync, key, localConfig.username, localConfig.deviceId);
  const dueReminders = await manager.getDue();

  const withWebhook = dueReminders.filter(r => r.webhook);
  if (withWebhook.length === 0) {
    await log(`Check complete — ${dueReminders.length} due reminder(s), none with webhooks.`);
    return 0;
  }

  let fired = 0;
  for (const reminder of withWebhook) {
    const ok = await fireWebhook(reminder);
    if (ok) {
      await log(`Webhook fired for reminder ${reminder.id}: "${reminder.message}"`);
      fired++;
    }
  }

  await log(`Check complete — fired ${fired}/${withWebhook.length} webhook(s).`);
  return fired;
}

/**
 * Run the checker on an interval (in minutes). Runs forever until killed.
 */
export async function runInterval(intervalMinutes: number = 5): Promise<never> {
  await log(`Interval mode started — checking every ${intervalMinutes} minute(s).`);

  // Run immediately on start
  await runCheck();

  const intervalMs = intervalMinutes * 60_000;

  return new Promise(() => {
    setInterval(async () => {
      try {
        await runCheck();
      } catch (err: any) {
        await log(`Unhandled error during check: ${err.message}`);
      }
    }, intervalMs);
  });
}

export { LOG_PATH };
