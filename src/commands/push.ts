import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadLocalConfig, loadRepoConfig } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';
import { SessionManager } from '../session/manager.js';
import { MemorySync } from '../memory/sync.js';

export async function push(options: { session?: string; memoryOnly?: boolean; sessionOnly?: boolean }) {
  const localConfig = await loadLocalConfig();
  if (!localConfig) {
    console.error('Not initialized. Run "device-sync init" first.');
    process.exit(1);
  }

  const key = await retrieveKey(localConfig.repoUrl);
  if (!key) {
    console.error('Encryption key not found in keychain. Run "device-sync init" again.');
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
    console.error('Repo config not found. Repository may be corrupted.');
    process.exit(1);
  }

  const isTeam = repoConfig.mode === 'team';
  let pushed = false;

  // Push session
  if (!options.memoryOnly) {
    const sessionPath = options.session ?? findClaudeSession();

    if (sessionPath && existsSync(sessionPath)) {
      console.log('Pushing session...');
      const sessionData = await readFile(sessionPath);
      const sessionManager = new SessionManager(sync, key, localConfig.username, localConfig.deviceId, isTeam);
      const cwd = process.cwd();
      const sessionId = await sessionManager.save(cwd, sessionData, `Session from ${localConfig.deviceName}`);
      console.log(`✓ Session saved: ${sessionId}`);
      pushed = true;
    } else if (!options.sessionOnly) {
      console.log('No session file found, skipping session sync.');
    } else {
      console.error('Session file not found.');
      process.exit(1);
    }
  }

  // Push memory
  if (!options.sessionOnly) {
    const memoryDir = findClaudeMemory();
    if (memoryDir && existsSync(memoryDir)) {
      console.log('Pushing memory...');
      const memorySync = new MemorySync(sync, key, localConfig.username, isTeam);
      const cwd = process.cwd();
      const count = await memorySync.push(cwd, memoryDir);
      console.log(`✓ ${count} memory files synced`);

      // In team mode, also push to shared if applicable
      if (isTeam) {
        const sharedCount = await memorySync.push(cwd, memoryDir, true);
        console.log(`✓ ${sharedCount} shared memory files synced`);
      }

      pushed = true;
    } else {
      console.log('No memory directory found, skipping memory sync.');
    }
  }

  if (pushed) {
    // Update last sync time in repo config
    if (repoConfig) {
      const device = repoConfig.devices.find(d => d.id === localConfig.deviceId);
      if (device) {
        device.lastSyncAt = new Date().toISOString();
        const { saveRepoConfig } = await import('../config.js');
        await saveRepoConfig(localConfig.localPath, repoConfig);
      }
    }

    await sync.push(`Sync from ${localConfig.deviceName}`);
    console.log('\n✓ Push complete!');
  } else {
    console.log('\nNothing to push.');
  }
}

/**
 * Find the Claude Code session file for the current project.
 */
function findClaudeSession(): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '~';
  const cwd = process.cwd();

  // Claude Code stores sessions in ~/.claude/projects/<project-hash>/
  const claudeDir = path.join(home, '.claude');
  if (!existsSync(claudeDir)) return null;

  // Look for conversation files
  const projectsDir = path.join(claudeDir, 'projects');
  if (!existsSync(projectsDir)) return null;

  // Hash the CWD to find the project dir (Claude Code uses path-based naming)
  // On Windows, replace backslashes too
  const projectDir = cwd.replace(/[\\/:]/g, '-').replace(/^-/, '');
  const possiblePath = path.join(projectsDir, projectDir);

  if (existsSync(possiblePath)) {
    // Find the most recent .jsonl conversation file
    const files = readdirSync(possiblePath)
      .filter((f: string) => f.endsWith('.jsonl'))
      .sort()
      .reverse();

    if (files.length > 0) {
      return path.join(possiblePath, files[0]);
    }
  }

  return null;
}

/**
 * Find the Claude Code memory directory for the current project.
 */
function findClaudeMemory(): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '~';
  const cwd = process.cwd();

  const projectDir = cwd.replace(/[\\/:]/g, '-').replace(/^-/, '');
  const memoryDir = path.join(home, '.claude', 'projects', projectDir, 'memory');

  return existsSync(memoryDir) ? memoryDir : null;
}
