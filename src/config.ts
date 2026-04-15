import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export type SyncMode = 'personal' | 'team';

export interface RepoConfig {
  version: number;
  mode: SyncMode;
  salt: string;           // Hex-encoded Argon2 salt
  keyFingerprint: string; // First 16 chars of SHA256(key + marker) — for password verification
  createdAt: string;
  devices: DeviceEntry[];
  team?: TeamConfig;
}

export interface DeviceEntry {
  id: string;
  name: string;
  user: string;           // Username (relevant for team mode)
  addedAt: string;
  lastSyncAt?: string;
}

export interface TeamConfig {
  members: TeamMember[];
}

export interface TeamMember {
  username: string;
  addedAt: string;
  role: 'owner' | 'member';
}

export interface LocalConfig {
  repoUrl: string;
  localPath: string;
  deviceId: string;
  deviceName: string;
  username: string;
}

const CONFIG_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? '~',
  '.claude-sync'
);

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getLocalConfigPath(): string {
  return path.join(CONFIG_DIR, 'config.json');
}

export function generateDeviceId(): string {
  return `${hostname()}-${randomBytes(4).toString('hex')}`;
}

export async function loadLocalConfig(): Promise<LocalConfig | null> {
  const configPath = getLocalConfigPath();
  if (!existsSync(configPath)) return null;

  const data = await readFile(configPath, 'utf-8');
  return JSON.parse(data) as LocalConfig;
}

export async function saveLocalConfig(config: LocalConfig): Promise<void> {
  const configPath = getLocalConfigPath();
  const { mkdir } = await import('node:fs/promises');
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Load the repo-level config (config.json inside the synced repo).
 */
export async function loadRepoConfig(repoPath: string): Promise<RepoConfig | null> {
  const configPath = path.join(repoPath, 'config.json');
  if (!existsSync(configPath)) return null;

  const data = await readFile(configPath, 'utf-8');
  return JSON.parse(data) as RepoConfig;
}

/**
 * Save the repo-level config.
 */
export async function saveRepoConfig(repoPath: string, config: RepoConfig): Promise<void> {
  const configPath = path.join(repoPath, 'config.json');
  await writeFile(configPath, JSON.stringify(config, null, 2));
}
