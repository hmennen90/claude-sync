import { loadLocalConfig, loadRepoConfig } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';
import { SessionManager } from '../session/manager.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export async function purge(options: { days?: string; dryRun?: boolean }) {
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

  const olderThanDays = options.days ? parseInt(options.days, 10) : 30;
  if (isNaN(olderThanDays) || olderThanDays < 1) {
    console.error('--days must be a positive number.');
    process.exit(1);
  }

  const dryRun = options.dryRun ?? false;

  const sync = new GitSync({
    repoUrl: localConfig.repoUrl,
    localPath: localConfig.localPath,
    deviceId: localConfig.deviceId,
  });

  await sync.pull();

  const repoConfig = await loadRepoConfig(localConfig.localPath);
  const isTeam = repoConfig?.mode === 'team';

  const sessionManager = new SessionManager(sync, key, localConfig.username, localConfig.deviceId, isTeam ?? false);

  const { deleted, bytesFreed } = await sessionManager.purge(olderThanDays, dryRun);

  if (deleted.length === 0) {
    console.log(`\nNo sessions older than ${olderThanDays} days found.`);
    return;
  }

  if (dryRun) {
    console.log(`\n[dry-run] Would delete ${deleted.length} session(s), freeing ${formatBytes(bytesFreed)}:\n`);
    console.log('ID               User            Updated                  Project');
    console.log('─'.repeat(90));
    for (const s of deleted) {
      const updated = new Date(s.updatedAt).toLocaleString();
      const project = s.projectPath.length > 24
        ? '...' + s.projectPath.slice(-21)
        : s.projectPath;
      console.log(
        `${s.sessionId.padEnd(17)}${s.username.padEnd(16)}${updated.padEnd(25)}${project}`
      );
    }
    console.log('');
  } else {
    console.log(`\nPurged ${deleted.length} session(s), freed ${formatBytes(bytesFreed)}.`);
    await sync.push(`purge: removed ${deleted.length} sessions older than ${olderThanDays}d`);
    console.log('Changes pushed to remote.');
  }
}
