import { readFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { encrypt, decrypt } from '../crypto/encryption.js';
import { GitSync } from '../git/sync.js';

/**
 * Manages shared memory sync.
 *
 * Personal mode:
 *   memory/{project-hash}/*.enc — encrypted memory files
 *
 * Team mode:
 *   memory/shared/{project-hash}/*.enc  — team-shared memories
 *   memory/{username}/{project-hash}/*.enc — personal memories
 */
export class MemorySync {
  constructor(
    private sync: GitSync,
    private key: Buffer,
    private username: string,
    private isTeam: boolean,
  ) {}

  /**
   * Hash a project path to a stable directory name.
   */
  private projectHash(projectPath: string): string {
    return createHash('sha256').update(projectPath).digest('hex').slice(0, 12);
  }

  /**
   * Get the repo-relative base path for memories.
   */
  private basePath(projectPath: string, shared: boolean = false): string {
    const hash = this.projectHash(projectPath);
    if (this.isTeam && shared) {
      return `memory/shared/${hash}`;
    }
    return `memory/${this.username}/${hash}`;
  }

  /**
   * Push a local memory directory to the sync repo.
   * Reads all .md files from the local memory dir, encrypts, and stores them.
   */
  async push(projectPath: string, localMemoryDir: string, shared: boolean = false): Promise<number> {
    if (!existsSync(localMemoryDir)) return 0;

    const files = await readdir(localMemoryDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    let count = 0;

    for (const file of mdFiles) {
      const content = await readFile(path.join(localMemoryDir, file));
      const encrypted = encrypt(content, this.key);

      // Store with original filename but .enc extension
      const encName = file.replace(/\.md$/, '.enc');
      await this.sync.writeFile(`${this.basePath(projectPath, shared)}/${encName}`, encrypted);
      count++;
    }

    // Also store a manifest (encrypted) mapping enc names back to originals
    const manifest = JSON.stringify(
      mdFiles.map(f => ({ original: f, encrypted: f.replace(/\.md$/, '.enc') }))
    );
    const encManifest = encrypt(Buffer.from(manifest), this.key);
    await this.sync.writeFile(`${this.basePath(projectPath, shared)}/manifest.enc`, encManifest);

    return count;
  }

  /**
   * Pull memories from sync repo to a local directory.
   * Decrypts and writes .md files.
   */
  async pull(projectPath: string, localMemoryDir: string, shared: boolean = false): Promise<number> {
    const manifestRaw = await this.sync.readFile(`${this.basePath(projectPath, shared)}/manifest.enc`);
    if (!manifestRaw) return 0;

    const manifest: Array<{ original: string; encrypted: string }> =
      JSON.parse(decrypt(manifestRaw, this.key).toString());

    await mkdir(localMemoryDir, { recursive: true });
    let count = 0;

    for (const entry of manifest) {
      const encData = await this.sync.readFile(`${this.basePath(projectPath, shared)}/${entry.encrypted}`);
      if (!encData) continue;

      const decrypted = decrypt(encData, this.key);
      const { writeFile: fsWrite } = await import('node:fs/promises');
      await fsWrite(path.join(localMemoryDir, entry.original), decrypted);
      count++;
    }

    return count;
  }

  /**
   * In team mode: pull shared memories from all team members.
   * Returns combined list of memory files.
   */
  async pullTeamShared(projectPath: string, localMemoryDir: string): Promise<number> {
    if (!this.isTeam) return 0;
    return this.pull(projectPath, localMemoryDir, true);
  }
}
