import { simpleGit, SimpleGit } from 'simple-git';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface SyncConfig {
  repoUrl: string;
  localPath: string;
  deviceId: string;
}

export class GitSync {
  private git: SimpleGit;
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
    this.git = simpleGit(config.localPath);
  }

  /**
   * Clone the repo if it doesn't exist locally, or pull latest.
   */
  async init(): Promise<void> {
    if (!existsSync(path.join(this.config.localPath, '.git'))) {
      await simpleGit().clone(this.config.repoUrl, this.config.localPath);
      this.git = simpleGit(this.config.localPath);
    }
  }

  /**
   * Pull latest changes, rebase local commits on top.
   */
  async pull(): Promise<void> {
    try {
      await this.git.fetch();
      await this.git.pull('origin', 'main', { '--rebase': 'true' });
    } catch (e: any) {
      // If remote is empty (first push), that's fine
      if (!e.message?.includes('no tracking information')) {
        throw e;
      }
    }
  }

  /**
   * Stage all changes, commit, and push.
   */
  async push(message: string): Promise<void> {
    await this.git.add('-A');
    const status = await this.git.status();

    if (status.files.length === 0) {
      return; // Nothing to sync
    }

    await this.git.commit(`[${this.config.deviceId}] ${message}`);

    try {
      await this.git.push('origin', 'main');
    } catch {
      // If main doesn't exist yet, push with upstream tracking
      await this.git.push(['-u', 'origin', 'main']);
    }
  }

  /**
   * Write an encrypted file to the repo working directory.
   */
  async writeFile(relativePath: string, data: Buffer): Promise<void> {
    const fullPath = path.join(this.config.localPath, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }

  /**
   * Read a file from the repo working directory.
   */
  async readFile(relativePath: string): Promise<Buffer | null> {
    const fullPath = path.join(this.config.localPath, relativePath);
    if (!existsSync(fullPath)) return null;
    return readFile(fullPath);
  }

  /**
   * Check if a file exists in the repo.
   */
  exists(relativePath: string): boolean {
    return existsSync(path.join(this.config.localPath, relativePath));
  }

  /**
   * Get the local repo path.
   */
  get repoPath(): string {
    return this.config.localPath;
  }
}
