import { loadLocalConfig, loadRepoConfig } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';

export async function status() {
  const localConfig = await loadLocalConfig();
  if (!localConfig) {
    console.log('\n❌ Not initialized. Run "claude-sync init <repo-url>" first.\n');
    return;
  }

  const key = await retrieveKey(localConfig.repoUrl);
  const repoConfig = await loadRepoConfig(localConfig.localPath);

  console.log('\nclaude-sync status\n');
  console.log(`  Repo:     ${localConfig.repoUrl}`);
  console.log(`  Local:    ${localConfig.localPath}`);
  console.log(`  Device:   ${localConfig.deviceId}`);
  console.log(`  Username: ${localConfig.username}`);
  console.log(`  Keychain: ${key ? '✓ Key stored' : '❌ Key missing'}`);

  if (repoConfig) {
    console.log(`  Mode:     ${repoConfig.mode}`);
    console.log(`  Devices:  ${repoConfig.devices.length}`);

    if (repoConfig.mode === 'team' && repoConfig.team) {
      console.log(`  Members:  ${repoConfig.team.members.length}`);
      for (const m of repoConfig.team.members) {
        console.log(`            • ${m.username} (${m.role})`);
      }
    }

    console.log(`\n  Devices:`);
    for (const d of repoConfig.devices) {
      const lastSync = d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString() : 'never';
      const isCurrent = d.id === localConfig.deviceId ? ' ← this device' : '';
      console.log(`    • ${d.name} (${d.user}) — last sync: ${lastSync}${isCurrent}`);
    }
  }

  console.log('');
}
