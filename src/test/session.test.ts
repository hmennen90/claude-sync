import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deriveKey } from '../crypto/encryption.js';
import { GitSync } from '../git/sync.js';
import { SessionManager } from '../session/manager.js';

/**
 * Create a GitSync instance backed by a temp directory (no actual git).
 * We only use readFile / writeFile / repoPath, which work on the filesystem.
 */
function createFakeSync(dir: string): GitSync {
  return new GitSync({
    repoUrl: '',
    localPath: dir,
    deviceId: 'test-device',
  });
}

describe('SessionManager', () => {
  let tmpDir: string;
  let key: Buffer;
  let manager: SessionManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'claude-sync-test-'));
    const derived = await deriveKey('session-test-password');
    key = derived.key;
    const sync = createFakeSync(tmpDir);
    manager = new SessionManager(sync, key, 'testuser', 'test-device', false);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('save and load round-trip works', async () => {
    const conversation = Buffer.from('test conversation data');
    const sessionId = await manager.save('/project/path', conversation, 'Test summary', 5);

    assert.ok(sessionId);
    assert.strictEqual(typeof sessionId, 'string');

    const loaded = await manager.loadLatest();
    assert.ok(loaded);
    assert.strictEqual(loaded.meta.sessionId, sessionId);
    assert.strictEqual(loaded.meta.username, 'testuser');
    assert.strictEqual(loaded.meta.deviceId, 'test-device');
    assert.strictEqual(loaded.meta.projectPath, '/project/path');
    assert.strictEqual(loaded.meta.summary, 'Test summary');
    assert.strictEqual(loaded.meta.messageCount, 5);
    assert.deepStrictEqual(loaded.conversation, conversation);
  });

  it('list returns saved sessions', async () => {
    await manager.save('/project/a', Buffer.from('conv-a'), 'Session A', 1);
    await manager.save('/project/b', Buffer.from('conv-b'), 'Session B', 2);

    const sessions = await manager.list();
    assert.strictEqual(sessions.length, 2);

    const summaries = sessions.map(s => s.summary);
    assert.ok(summaries.includes('Session A'));
    assert.ok(summaries.includes('Session B'));
  });

  it('loadLatest returns the most recent session', async () => {
    await manager.save('/project/old', Buffer.from('old'), 'Old session', 1);
    await manager.save('/project/new', Buffer.from('new'), 'New session', 2);

    const latest = await manager.loadLatest();
    assert.ok(latest);
    assert.strictEqual(latest.meta.summary, 'New session');
    assert.deepStrictEqual(latest.conversation, Buffer.from('new'));
  });
});
