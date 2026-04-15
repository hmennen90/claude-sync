import { loadLocalConfig, loadRepoConfig, saveRepoConfig } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';

export async function teamAdd(username: string, options: { role?: string }) {
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
  if (!repoConfig) {
    console.error('Repo config not found.');
    process.exit(1);
  }

  if (repoConfig.mode !== 'team') {
    console.error('This sync is in personal mode. Re-initialize with --mode team to use team features.');
    process.exit(1);
  }

  if (!repoConfig.team) {
    repoConfig.team = { members: [] };
  }

  const existing = repoConfig.team.members.find(m => m.username === username);
  if (existing) {
    console.log(`User "${username}" is already a team member (${existing.role}).`);
    return;
  }

  const role = (options.role ?? 'member') as 'owner' | 'member';
  repoConfig.team.members.push({
    username,
    addedAt: new Date().toISOString(),
    role,
  });

  await saveRepoConfig(localConfig.localPath, repoConfig);
  await sync.push(`Add team member: ${username}`);

  console.log(`\n✓ Added ${username} as ${role}`);
  console.log(`  They can join by running: claude-sync init ${localConfig.repoUrl} --mode team -u ${username}\n`);
}
