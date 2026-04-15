import { loadLocalConfig, loadRepoConfig } from '../config.js';
import { retrieveKey } from '../crypto/keychain.js';
import { GitSync } from '../git/sync.js';
import { SessionManager } from '../session/manager.js';

export async function resume(options: { user?: string; project?: string }) {
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

  if (options.user || options.project) {
    // Filtered resume
    let sessions = await sessionManager.list();

    if (options.user) {
      sessions = sessions.filter(s => s.username === options.user);
    }
    if (options.project) {
      sessions = sessions.filter(s => s.projectPath === options.project);
    }

    if (sessions.length === 0) {
      console.log('No matching sessions found.');
      return;
    }

    const latest = sessions[0];
    const sessionPath = `sessions/${isTeam ? latest.username + '/' : ''}${latest.deviceId}/${latest.sessionId}.enc`;
    const session = await sessionManager.load(sessionPath);

    if (!session) {
      console.error('Could not load session.');
      return;
    }

    printSessionInfo(session.meta);
    outputSession(session.conversation);
  } else {
    // Resume latest
    const session = await sessionManager.loadLatest();

    if (!session) {
      console.log('No sessions found.');
      return;
    }

    printSessionInfo(session.meta);
    outputSession(session.conversation);
  }
}

function printSessionInfo(meta: import('../session/manager.js').SessionMeta) {
  console.log('\n📋 Resuming session:\n');
  console.log(`  ID:      ${meta.sessionId}`);
  console.log(`  From:    ${meta.username} @ ${meta.deviceId}`);
  console.log(`  Project: ${meta.projectPath}`);
  console.log(`  Created: ${new Date(meta.createdAt).toLocaleString()}`);
  console.log(`  Updated: ${new Date(meta.updatedAt).toLocaleString()}`);
  console.log(`  Summary: ${meta.summary}`);
  console.log('');
}

function outputSession(conversation: Buffer) {
  // Write the session data to stdout for Claude Code to consume
  // The actual integration with Claude Code's --resume flag would go here
  console.log(`Session data: ${conversation.length} bytes`);
  console.log('(Integration with "claude --resume" pending)');
}
