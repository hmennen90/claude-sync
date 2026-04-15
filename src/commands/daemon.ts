import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { runCheck, LOG_PATH } from '../daemon/checker.js';

const PLIST_LABEL = 'com.claude-sync.daemon';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_LABEL}.plist`);
const CRONTAB_MARKER = '# claude-sync-daemon';

function isMacOS(): boolean {
  return process.platform === 'darwin';
}

function getExecutablePath(): string {
  // Resolve the claude-sync binary. Prefer the globally-linked bin,
  // fall back to npx/node invocation of the compiled entry point.
  try {
    return execSync('which claude-sync', { encoding: 'utf-8' }).trim();
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
// Public command handlers
// ---------------------------------------------------------------------------

export async function daemonStart(): Promise<void> {
  if (isMacOS()) {
    await installLaunchd();
  } else {
    installCrontab();
  }
}

export async function daemonStop(): Promise<void> {
  if (isMacOS()) {
    await uninstallLaunchd();
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
  const installed = isMacOS() ? isLaunchdInstalled() : isCrontabInstalled();
  const method = isMacOS() ? 'launchd' : 'crontab';

  console.log(`Daemon: ${installed ? 'installed' : 'not installed'} (${method})`);

  if (isMacOS() && existsSync(PLIST_PATH)) {
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
