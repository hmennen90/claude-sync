import { readFile, readdir, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { encrypt, decrypt } from '../crypto/encryption.js';
import { GitSync } from '../git/sync.js';

export interface SessionMeta {
  sessionId: string;
  deviceId: string;
  username: string;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  summary: string;
}

export interface SessionData {
  meta: SessionMeta;
  conversation: Buffer; // Full serialized conversation
}

/**
 * Manages session storage — full sessions encrypted in the git repo.
 *
 * Personal mode:
 *   sessions/{device-id}/{session-hash}.enc
 *   sessions/latest.enc
 *
 * Team mode — all sessions visible to all members:
 *   sessions/{username}/{device-id}/{session-hash}.enc
 *   sessions/latest.enc   — global latest (any team member)
 */
export class SessionManager {
  constructor(
    private sync: GitSync,
    private key: Buffer,
    private username: string,
    private deviceId: string,
    private isTeam: boolean,
  ) {}

  private sessionDir(): string {
    if (this.isTeam) {
      return `sessions/${this.username}/${this.deviceId}`;
    }
    return `sessions/${this.deviceId}`;
  }

  /**
   * Save a full Claude Code session.
   */
  async save(projectPath: string, conversationData: Buffer, summary: string, messageCount: number = 0): Promise<string> {
    const sessionId = createHash('sha256')
      .update(`${this.deviceId}-${Date.now()}-${projectPath}`)
      .digest('hex')
      .slice(0, 16);

    const meta: SessionMeta = {
      sessionId,
      deviceId: this.deviceId,
      username: this.username,
      projectPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount,
      summary,
    };

    const serialized = Buffer.from(JSON.stringify({
      meta,
      conversation: conversationData.toString('base64'),
    }));

    const encrypted = encrypt(serialized, this.key);
    const sessionPath = `${this.sessionDir()}/${sessionId}.enc`;
    await this.sync.writeFile(sessionPath, encrypted);

    // Update global latest pointer
    const latestData = encrypt(
      Buffer.from(JSON.stringify({
        sessionId,
        username: this.username,
        deviceId: this.deviceId,
        sessionPath,
      })),
      this.key,
    );
    await this.sync.writeFile('sessions/latest.enc', latestData);

    return sessionId;
  }

  /**
   * Load the latest session — in team mode this could be from any team member.
   */
  async loadLatest(): Promise<SessionData | null> {
    const latestRaw = await this.sync.readFile('sessions/latest.enc');
    if (!latestRaw) return null;

    const latestJson = JSON.parse(decrypt(latestRaw, this.key).toString());
    return this.load(latestJson.sessionPath);
  }

  /**
   * Load a specific session by repo-relative path.
   */
  async load(sessionPath: string): Promise<SessionData | null> {
    const raw = await this.sync.readFile(sessionPath);
    if (!raw) return null;

    const decrypted = JSON.parse(decrypt(raw, this.key).toString());
    return {
      meta: decrypted.meta,
      conversation: Buffer.from(decrypted.conversation, 'base64'),
    };
  }

  /**
   * List all sessions — in team mode, across all users and devices.
   */
  async list(): Promise<SessionMeta[]> {
    const sessions: SessionMeta[] = [];
    const sessionsDir = path.join(this.sync.repoPath, 'sessions');

    if (!existsSync(sessionsDir)) return sessions;

    await this.collectSessions(sessionsDir, sessions);

    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Recursively find and decrypt all .enc session files.
   */
  private async collectSessions(dir: string, sessions: SessionMeta[]): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.collectSessions(fullPath, sessions);
      } else if (entry.name.endsWith('.enc') && entry.name !== 'latest.enc') {
        try {
          const raw = await readFile(fullPath);
          const decrypted = JSON.parse(decrypt(raw, this.key).toString());
          sessions.push(decrypted.meta);
        } catch {
          // Skip corrupted sessions
        }
      }
    }
  }

  /**
   * List sessions filtered by username (useful in team mode).
   */
  async listByUser(username: string): Promise<SessionMeta[]> {
    const all = await this.list();
    return all.filter(s => s.username === username);
  }

  /**
   * List sessions filtered by project path.
   */
  async listByProject(projectPath: string): Promise<SessionMeta[]> {
    const all = await this.list();
    return all.filter(s => s.projectPath === projectPath);
  }

  /**
   * Purge sessions older than N days (based on meta.updatedAt).
   * Returns an array of purged session metas (useful for dry-run reporting).
   * If dryRun is true, no files are actually deleted.
   */
  async purge(olderThanDays: number = 30, dryRun: boolean = false): Promise<{ deleted: SessionMeta[]; bytesFreed: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const sessionsDir = path.join(this.sync.repoPath, 'sessions');
    if (!existsSync(sessionsDir)) return { deleted: [], bytesFreed: 0 };

    const result: { meta: SessionMeta; filePath: string }[] = [];
    await this.collectPurgeCandidates(sessionsDir, cutoff, result);

    if (dryRun) {
      let bytesFreed = 0;
      for (const { filePath } of result) {
        const fileStat = await stat(filePath);
        bytesFreed += fileStat.size;
      }
      return { deleted: result.map(r => r.meta), bytesFreed };
    }

    // Check what the current latest session points to
    let latestSessionId: string | null = null;
    try {
      const latestRaw = await this.sync.readFile('sessions/latest.enc');
      if (latestRaw) {
        const latestJson = JSON.parse(decrypt(latestRaw, this.key).toString());
        latestSessionId = latestJson.sessionId ?? null;
      }
    } catch {
      // No valid latest pointer
    }

    let bytesFreed = 0;
    const deletedIds = new Set<string>();

    for (const { meta, filePath } of result) {
      const fileStat = await stat(filePath);
      bytesFreed += fileStat.size;
      await unlink(filePath);
      deletedIds.add(meta.sessionId);
    }

    // If the latest session was deleted, update latest.enc to point to the newest remaining session
    if (latestSessionId && deletedIds.has(latestSessionId)) {
      const remaining = await this.list();
      if (remaining.length > 0) {
        // list() returns sorted by updatedAt descending, so first is newest
        const newest = remaining[0];
        const newestDir = this.isTeam
          ? `sessions/${newest.username}/${newest.deviceId}`
          : `sessions/${newest.deviceId}`;
        const newestPath = `${newestDir}/${newest.sessionId}.enc`;

        const latestData = encrypt(
          Buffer.from(JSON.stringify({
            sessionId: newest.sessionId,
            username: newest.username,
            deviceId: newest.deviceId,
            sessionPath: newestPath,
          })),
          this.key,
        );
        await this.sync.writeFile('sessions/latest.enc', latestData);
      } else {
        // No sessions left, remove latest pointer
        const latestPath = path.join(this.sync.repoPath, 'sessions', 'latest.enc');
        if (existsSync(latestPath)) {
          await unlink(latestPath);
        }
      }
    }

    return { deleted: result.map(r => r.meta), bytesFreed };
  }

  /**
   * Recursively find session files older than the cutoff date.
   */
  private async collectPurgeCandidates(
    dir: string,
    cutoff: Date,
    results: { meta: SessionMeta; filePath: string }[],
  ): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.collectPurgeCandidates(fullPath, cutoff, results);
      } else if (entry.name.endsWith('.enc') && entry.name !== 'latest.enc') {
        try {
          const raw = await readFile(fullPath);
          const decrypted = JSON.parse(decrypt(raw, this.key).toString());
          const meta: SessionMeta = decrypted.meta;
          if (new Date(meta.updatedAt) < cutoff) {
            results.push({ meta, filePath: fullPath });
          }
        } catch {
          // Skip corrupted sessions
        }
      }
    }
  }
}
