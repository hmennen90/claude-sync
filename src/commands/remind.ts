import { loadLocalConfig, loadRepoConfig } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';
import { ReminderManager, parseReminderTime } from '../reminders/manager.js';

export async function remind(
  when: string,
  messageParts: string[],
  options: { webhook?: string },
) {
  const localConfig = await loadLocalConfig();
  if (!localConfig) {
    console.error('Not initialized. Run "claude-sync init" first.');
    process.exit(1);
  }

  const key = await retrieveKey(localConfig.repoUrl);
  if (!key) {
    console.error('Encryption key not found in keychain.');
    process.exit(1);
  }

  const sync = new GitSync({
    repoUrl: localConfig.repoUrl,
    localPath: localConfig.localPath,
    deviceId: localConfig.deviceId,
  });

  await sync.pull();

  const manager = new ReminderManager(sync, key, localConfig.username, localConfig.deviceId);

  const message = messageParts.join(' ');
  let dueAt: Date;

  try {
    dueAt = parseReminderTime(when);
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }

  const reminder = await manager.add(message, dueAt, options.webhook);
  await sync.push(`Add reminder: ${message.slice(0, 50)}`);

  console.log(`\n✓ Reminder set!`);
  console.log(`  Message: ${reminder.message}`);
  console.log(`  Due:     ${new Date(reminder.dueAt).toLocaleString()}`);
  if (reminder.webhook) {
    console.log(`  Webhook: ${reminder.webhook}`);
  }
  console.log('');
}

export async function reminders(options: { due?: boolean; dismiss?: boolean }) {
  const localConfig = await loadLocalConfig();
  if (!localConfig) {
    console.error('Not initialized. Run "claude-sync init" first.');
    process.exit(1);
  }

  const key = await retrieveKey(localConfig.repoUrl);
  if (!key) {
    console.error('Encryption key not found in keychain.');
    process.exit(1);
  }

  const sync = new GitSync({
    repoUrl: localConfig.repoUrl,
    localPath: localConfig.localPath,
    deviceId: localConfig.deviceId,
  });

  await sync.pull();

  const manager = new ReminderManager(sync, key, localConfig.username, localConfig.deviceId);

  if (options.dismiss) {
    const dismissed = await manager.dismissDue();
    if (dismissed.length > 0) {
      console.log(`\n✓ Dismissed ${dismissed.length} reminder(s):\n`);
      for (const r of dismissed) {
        console.log(`  • ${r.message}`);
      }
      await sync.push('Dismiss due reminders');
    } else {
      console.log('\nNo due reminders to dismiss.');
    }
    return;
  }

  const list = options.due
    ? await manager.getDue()
    : await manager.getPending();

  if (list.length === 0) {
    console.log(options.due ? '\nNo due reminders.' : '\nNo pending reminders.');
    return;
  }

  const now = new Date();
  console.log(`\n${options.due ? 'Due' : 'Pending'} reminders:\n`);

  for (const r of list) {
    const dueDate = new Date(r.dueAt);
    const isDue = dueDate <= now;
    const marker = isDue ? '⏰' : '  ';
    const by = r.username !== localConfig.username ? ` (${r.username})` : '';

    console.log(`${marker} ${r.message}${by}`);
    console.log(`   Due: ${dueDate.toLocaleString()}${isDue ? ' [DUE]' : ''}`);
    console.log(`   ID:  ${r.id}`);
    console.log('');
  }
}
