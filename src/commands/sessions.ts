import { loadLocalConfig, loadRepoConfig } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';
import { SessionManager } from '../session/manager.js';

export async function sessions(options: { user?: string; project?: string }) {
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

  const repoConfig = await loadRepoConfig(localConfig.localPath);
  const isTeam = repoConfig?.mode === 'team';

  const sessionManager = new SessionManager(sync, key, localConfig.username, localConfig.deviceId, isTeam ?? false);

  let list = await sessionManager.list();

  if (options.user) {
    list = list.filter(s => s.username === options.user);
  }
  if (options.project) {
    list = list.filter(s => s.projectPath === options.project);
  }

  if (list.length === 0) {
    console.log('\nNo sessions found.');
    return;
  }

  console.log(`\n${list.length} session(s):\n`);
  console.log('ID               User            Device          Project                  Updated');
  console.log('─'.repeat(100));

  for (const s of list) {
    const updated = new Date(s.updatedAt).toLocaleString();
    const project = s.projectPath.length > 24
      ? '...' + s.projectPath.slice(-21)
      : s.projectPath;

    console.log(
      `${s.sessionId.padEnd(17)}${s.username.padEnd(16)}${s.deviceId.slice(0, 14).padEnd(16)}${project.padEnd(25)}${updated}`
    );
  }
  console.log('');
}
