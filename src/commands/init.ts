import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { deriveKey, keyFingerprint } from '../crypto/encryption.js';
import { storeKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';
import {
  generateDeviceId,
  saveLocalConfig,
  loadRepoConfig,
  saveRepoConfig,
  getConfigDir,
  type SyncMode,
  type RepoConfig,
  type LocalConfig,
} from '../config.js';

export async function init(repoUrl: string, options: { mode: string; username?: string }) {
  const rl = createInterface({ input: stdin, output: stdout });
  const mode = options.mode as SyncMode;

  console.log('\n🔧 claude-sync init\n');

  // Get username
  let username = options.username;
  if (!username) {
    username = await rl.question('Username: ');
  }
  if (!username) {
    console.error('Username is required.');
    process.exit(1);
  }

  // Get password
  const password = await rl.question('Encryption password: ');
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const confirmPassword = await rl.question('Confirm password: ');
  if (password !== confirmPassword) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  rl.close();

  const deviceId = generateDeviceId();
  const deviceName = deviceId.split('-')[0]; // hostname part
  const localPath = path.join(getConfigDir(), 'repo');

  console.log(`\nDevice ID: ${deviceId}`);
  console.log(`Mode: ${mode}`);
  console.log(`Syncing to: ${localPath}\n`);

  // Clone or init the repo
  await mkdir(getConfigDir(), { recursive: true });

  const sync = new GitSync({ repoUrl, localPath, deviceId });
  console.log('Cloning repository...');
  await sync.init();
  await sync.pull();

  // Check if repo already has a config (joining existing sync)
  const existingConfig = await loadRepoConfig(localPath);

  if (existingConfig) {
    // Joining existing sync — verify password matches
    console.log('Found existing sync config, verifying password...');

    const salt = Buffer.from(existingConfig.salt, 'hex');
    const { key } = await deriveKey(password, salt);
    const fp = keyFingerprint(key);

    if (fp !== existingConfig.keyFingerprint) {
      console.error('Password does not match the existing sync. Check your password.');
      process.exit(1);
    }

    // Add this device
    existingConfig.devices.push({
      id: deviceId,
      name: deviceName,
      user: username,
      addedAt: new Date().toISOString(),
    });

    // Add team member if team mode
    if (existingConfig.mode === 'team' && existingConfig.team) {
      const alreadyMember = existingConfig.team.members.some(m => m.username === username);
      if (!alreadyMember) {
        existingConfig.team.members.push({
          username,
          addedAt: new Date().toISOString(),
          role: 'member',
        });
      }
    }

    await saveRepoConfig(localPath, existingConfig);
    await storeKey(repoUrl, key);
    await sync.push('Add device ' + deviceId);

    console.log('✓ Joined existing sync successfully!');
  } else {
    // New sync — create config
    console.log('Deriving encryption key...');
    const { key, salt } = await deriveKey(password);

    const repoConfig: RepoConfig = {
      version: 1,
      mode,
      salt: salt.toString('hex'),
      keyFingerprint: keyFingerprint(key),
      createdAt: new Date().toISOString(),
      devices: [{
        id: deviceId,
        name: deviceName,
        user: username,
        addedAt: new Date().toISOString(),
      }],
    };

    if (mode === 'team') {
      repoConfig.team = {
        members: [{
          username,
          addedAt: new Date().toISOString(),
          role: 'owner',
        }],
      };
    }

    // Write .gitignore
    await sync.writeFile('.gitignore', Buffer.from('.keys/\n'));

    await saveRepoConfig(localPath, repoConfig);
    await storeKey(repoUrl, key);
    await sync.push('Initialize claude-sync');

    console.log('✓ Sync initialized successfully!');
  }

  // Save local config
  const localConfig: LocalConfig = {
    repoUrl,
    localPath,
    deviceId,
    deviceName,
    username,
  };
  await saveLocalConfig(localConfig);

  console.log(`\n✓ Key stored in system keychain`);
  console.log(`✓ Local config saved to ${getConfigDir()}/config.json`);
  console.log('\nReady! Use "claude-sync push" and "claude-sync pull" to sync.\n');
}
