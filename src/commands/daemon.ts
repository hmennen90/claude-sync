import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { runCheck, LOG_PATH } from '../daemon/checker.js';

const PLIST_LABEL = 'com.claude-sync.daemon';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);
const CRONTAB_MARKER = '# claude-sync-daemon';
const TASK_NAME = 'ClaudeSyncDaemon';

type Platform = 'macos' | 'linux' | 'windows';

function getPlatform(): Platform {
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'win32') return 'windows';
  return 'linux';
}

function getExecutablePath(): string {
  // Resolve the claude-sync binary. Prefer the globally-linked bin,
  // fall back to npx/node invocation of the compiled entry point.
  const whichCmd = process.platform === 'win32' ? 'where claude-sync' : 'which claude-sync';
  try {
    return execSync(whichCmd, { encoding: 'utf-8' }).trim().split('\n')[0];
  } catch {
    // Fallback: run the dist entry directly with node
    const distCli = path.resolve(import.meta.dirname, '..', '..', 'dist', 'cli.js');
    const nodePath = process.execPath;
    return `${nodePath} ${distCli}`;
  }
}

// ---------------------------------------------------------------------------
// macOS: launchd plist
// ---------------------------------------------------------------------------

function buildPlist(executablePath: string): string {
  // If the executable path contains a space (i.e., "node /path/to/cli.js"),
  // split into program + arguments for launchd.
  const parts = executablePath.split(' ');
  const programArgs = [...parts, 'daemon', 'check'];

  const argsXml = programArgs.map(a => `      <string>${a}</string>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
</dict>
</plist>`;
}

async function installLaunchd(): Promise<void> {
  const executablePath = getExecutablePath();
  const plist = buildPlist(executablePath);
  await writeFile(PLIST_PATH, plist);

  try {
    execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null`, { stdio: 'ignore' });
  } catch { /* not loaded yet — fine */ }

  execSync(`launchctl load "${PLIST_PATH}"`);
  console.log(`Daemon installed and started (launchd).`);
  console.log(`  Plist: ${PLIST_PATH}`);
  console.log(`  Log:   ${LOG_PATH}`);
}

async function uninstallLaunchd(): Promise<void> {
  if (!existsSync(PLIST_PATH)) {
    console.log('Daemon is not installed.');
    return;
  }

  try {
    execSync(`launchctl unload "${PLIST_PATH}"`, { stdio: 'ignore' });
  } catch { /* already unloaded */ }

  await unlink(PLIST_PATH);
  console.log('Daemon stopped and removed.');
}

function isLaunchdInstalled(): boolean {
  if (!existsSync(PLIST_PATH)) return false;

  try {
    const output = execSync(`launchctl list 2>/dev/null`, { encoding: 'utf-8' });
    return output.includes(PLIST_LABEL);
  } catch {
    return existsSync(PLIST_PATH);
  }
}

// ---------------------------------------------------------------------------
// Linux: crontab
// ---------------------------------------------------------------------------

function getCurrentCrontab(): string {
  try {
    return execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' });
  } catch {
    return '';
  }
}

function installCrontab(): void {
  const executablePath = getExecutablePath();
  const cronLine = `*/5 * * * * ${executablePath} daemon check ${CRONTAB_MARKER}`;

  let crontab = getCurrentCrontab();

  // Remove existing entry if present
  crontab = crontab
    .split('\n')
    .filter(line => !line.includes(CRONTAB_MARKER))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  // Append new entry
  if (!crontab.endsWith('\n')) crontab += '\n';
  crontab += `${cronLine}\n`;

  execSync(`echo ${JSON.stringify(crontab)} | crontab -`);

  console.log(`Daemon installed (crontab — every 5 minutes).`);
  console.log(`  Log: ${LOG_PATH}`);
}

function uninstallCrontab(): void {
  let crontab = getCurrentCrontab();

  if (!crontab.includes(CRONTAB_MARKER)) {
    console.log('Daemon is not installed.');
    return;
  }

  crontab = crontab
    .split('\n')
    .filter(line => !line.includes(CRONTAB_MARKER))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  execSync(`echo ${JSON.stringify(crontab)} | crontab -`);
  console.log('Daemon removed from crontab.');
}

function isCrontabInstalled(): boolean {
  return getCurrentCrontab().includes(CRONTAB_MARKER);
}

// ---------------------------------------------------------------------------
// Windows: Task Scheduler
// ---------------------------------------------------------------------------

function installTaskScheduler(): void {
  const executablePath = getExecutablePath();
  const parts = executablePath.split(' ');

  // Build the schtasks command
  // If it's "node /path/to/cli.js", we need to set the program and args separately
  let program: string;
  let args: string;
  if (parts.length > 1) {
    program = parts[0];
    args = [...parts.slice(1), 'daemon', 'check'].join(' ');
  } else {
    program = parts[0];
    args = 'daemon check';
  }

  // Delete existing task if present (ignore error if not found)
  try {
    execSync(`schtasks /Delete /TN "${TASK_NAME}" /F 2>NUL`, { stdio: 'ignore' });
  } catch { /* not found — fine */ }

  // Create a new scheduled task running every 5 minutes
  execSync(
    `schtasks /Create /TN "${TASK_NAME}" /TR "${program} ${args}" /SC MINUTE /MO 5 /F`,
  );

  console.log(`Daemon installed (Windows Task Scheduler — every 5 minutes).`);
  console.log(`  Task: ${TASK_NAME}`);
  console.log(`  Log:  ${LOG_PATH}`);
}

function uninstallTaskScheduler(): void {
  try {
    execSync(`schtasks /Query /TN "${TASK_NAME}" 2>NUL`, { stdio: 'ignore' });
  } catch {
    console.log('Daemon is not installed.');
    return;
  }

  execSync(`schtasks /Delete /TN "${TASK_NAME}" /F`);
  console.log('Daemon removed from Task Scheduler.');
}

function isTaskSchedulerInstalled(): boolean {
  try {
    execSync(`schtasks /Query /TN "${TASK_NAME}" 2>NUL`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public command handlers
// ---------------------------------------------------------------------------

export async function daemonStart(): Promise<void> {
  const platform = getPlatform();
  if (platform === 'macos') {
    await installLaunchd();
  } else if (platform === 'windows') {
    installTaskScheduler();
  } else {
    installCrontab();
  }
}

export async function daemonStop(): Promise<void> {
  const platform = getPlatform();
  if (platform === 'macos') {
    await uninstallLaunchd();
  } else if (platform === 'windows') {
    uninstallTaskScheduler();
  } else {
    uninstallCrontab();
  }
}

export async function daemonCheck(): Promise<void> {
  try {
    const fired = await runCheck();
    if (fired > 0) {
      console.log(`Fired ${fired} webhook(s).`);
    } else {
      console.log('No webhooks to fire.');
    }
  } catch (err: any) {
    console.error(`Check failed: ${err.message}`);
    process.exit(1);
  }
}

export async function daemonStatus(): Promise<void> {
  const platform = getPlatform();
  const installed = platform === 'macos'
    ? isLaunchdInstalled()
    : platform === 'windows'
      ? isTaskSchedulerInstalled()
      : isCrontabInstalled();
  const method = platform === 'macos' ? 'launchd' : platform === 'windows' ? 'Task Scheduler' : 'crontab';

  console.log(`Daemon: ${installed ? 'installed' : 'not installed'} (${method})`);

  if (platform === 'macos' && existsSync(PLIST_PATH)) {
    console.log(`  Plist: ${PLIST_PATH}`);
  }

  if (existsSync(LOG_PATH)) {
    const logStat = await stat(LOG_PATH);
    console.log(`  Log:   ${LOG_PATH} (${(logStat.size / 1024).toFixed(1)} KB)`);
    console.log(`  Last modified: ${logStat.mtime.toLocaleString()}`);
  } else {
    console.log(`  Log:   ${LOG_PATH} (not yet created)`);
  }
}

export async function daemonLog(): Promise<void> {
  if (!existsSync(LOG_PATH)) {
    console.log('No log file yet. Run "claude-sync daemon check" first.');
    return;
  }

  const content = await readFile(LOG_PATH, 'utf-8');
  const lines = content.trimEnd().split('\n');

  // Show last 50 lines
  const tail = lines.slice(-50);
  console.log(tail.join('\n'));
}
