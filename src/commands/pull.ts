import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadLocalConfig, loadRepoConfig } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';
import { MemorySync } from '../memory/sync.js';
import { ReminderManager } from '../reminders/manager.js';

export async function pull(options: { memoryOnly?: boolean }) {
  const localConfig = await loadLocalConfig();
  if (!localConfig) {
    console.error('Not initialized. Run "claude-sync init" first.');
    process.exit(1);
  }

  const key = await retrieveKey(localConfig.repoUrl);
  if (!key) {
    console.error('Encryption key not found in keychain. Run "claude-sync init" again.');
    process.exit(1);
  }

  const sync = new GitSync({
    repoUrl: localConfig.repoUrl,
    localPath: localConfig.localPath,
    deviceId: localConfig.deviceId,
  });

  console.log('Pulling latest...');
  await sync.pull();

  const repoConfig = await loadRepoConfig(localConfig.localPath);
  if (!repoConfig) {
    console.error('Repo config not found.');
    process.exit(1);
  }

  const isTeam = repoConfig.mode === 'team';

  // Pull memory
  const memoryDir = getClaudeMemoryDir();
  if (memoryDir) {
    const memorySync = new MemorySync(sync, key, localConfig.username, isTeam);
    const cwd = process.cwd();
    const count = await memorySync.pull(cwd, memoryDir);
    console.log(`✓ ${count} memory files pulled`);

    if (isTeam) {
      const sharedDir = memoryDir.replace(/memory$/, 'memory-shared');
      const sharedCount = await memorySync.pullTeamShared(cwd, sharedDir);
      console.log(`✓ ${sharedCount} shared team memory files pulled`);
    }
  }

  // Check for due reminders
  const reminderManager = new ReminderManager(sync, key, localConfig.username, localConfig.deviceId);
  const dueReminders = await reminderManager.getDue();

  if (dueReminders.length > 0) {
    console.log(`\n⏰ ${dueReminders.length} due reminder(s):\n`);
    for (const r of dueReminders) {
      const by = r.username !== localConfig.username ? ` (from ${r.username})` : '';
      console.log(`  • ${r.message}${by}`);
      console.log(`    Due: ${new Date(r.dueAt).toLocaleString()}`);
    }
    console.log('\n  Use "claude-sync reminders --dismiss" to dismiss.');
  }

  console.log('\n✓ Pull complete!');
}

function getClaudeMemoryDir(): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '~';
  const cwd = process.cwd();
  const projectDir = cwd.replace(/[\\/]/g, '-').replace(/^-/, '');
  const memoryDir = path.join(home, '.claude', 'projects', projectDir, 'memory');

  // Create if it doesn't exist? No — only pull if Claude Code has the structure
  return existsSync(path.join(home, '.claude', 'projects', projectDir)) ? memoryDir : null;
}
