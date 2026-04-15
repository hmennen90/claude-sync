import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const CLAUDE_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? '~',
  '.claude'
);
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

const HOOK_MARKER = 'claude-sync';

interface HookEntry {
  matcher: string;
  command: string;
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Wrap a command so it fails silently on both Unix and Windows.
 */
function silentWrap(cmd: string): string {
  if (process.platform === 'win32') {
    return `cmd /c "${cmd} 2>NUL || exit /b 0"`;
  }
  return `${cmd} 2>/dev/null || true`;
}

/**
 * The hooks claude-sync installs into Claude Code's settings.json.
 */
function getSyncHooks(): Record<string, HookEntry[]> {
  return {
    PreToolUse: [
      {
        matcher: '',
        command: silentWrap('claude-sync pull --memory-only'),
      },
    ],
    PostToolUse: [
      {
        matcher: 'Write|Edit',
        command: silentWrap('claude-sync push --memory-only'),
      },
    ],
    SessionStart: [
      {
        matcher: '',
        command: silentWrap('claude-sync pull'),
      },
    ],
    SessionEnd: [
      {
        matcher: '',
        command: silentWrap('claude-sync push'),
      },
    ],
  };
}

/**
 * Load Claude Code settings.json, returning an empty object if it doesn't exist.
 */
async function loadSettings(): Promise<ClaudeSettings> {
  if (!existsSync(SETTINGS_PATH)) {
    return {};
  }
  const raw = await readFile(SETTINGS_PATH, 'utf-8');
  return JSON.parse(raw) as ClaudeSettings;
}

/**
 * Save settings.json, creating ~/.claude/ if needed.
 */
async function saveSettings(settings: ClaudeSettings): Promise<void> {
  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Check whether a hook entry was installed by claude-sync.
 */
function isOurHook(entry: HookEntry): boolean {
  return entry.command.includes(HOOK_MARKER);
}

/**
 * Install claude-sync hooks into Claude Code's settings.json.
 * Merges with existing hooks without overwriting them.
 */
export async function installHooks(): Promise<void> {
  const settings = await loadSettings();
  const syncHooks = getSyncHooks();

  if (!settings.hooks) {
    settings.hooks = {};
  }

  let installedCount = 0;

  for (const [event, newEntries] of Object.entries(syncHooks)) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    for (const newEntry of newEntries) {
      // Skip if we already have this exact hook installed
      const alreadyExists = settings.hooks[event].some(
        (existing) => isOurHook(existing) && existing.command === newEntry.command
      );

      if (!alreadyExists) {
        settings.hooks[event].push(newEntry);
        installedCount++;
      }
    }
  }

  await saveSettings(settings);

  if (installedCount === 0) {
    console.log('All hooks already installed.');
  } else {
    console.log(`Installed ${installedCount} hook(s) into ${SETTINGS_PATH}`);
  }
}

/**
 * Remove all claude-sync hooks from Claude Code's settings.json.
 */
export async function uninstallHooks(): Promise<void> {
  const settings = await loadSettings();

  if (!settings.hooks) {
    console.log('No hooks found in settings.');
    return;
  }

  let removedCount = 0;

  for (const event of Object.keys(settings.hooks)) {
    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter(
      (entry) => !isOurHook(entry)
    );
    removedCount += before - settings.hooks[event].length;

    // Clean up empty arrays
    if (settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await saveSettings(settings);

  if (removedCount === 0) {
    console.log('No claude-sync hooks found to remove.');
  } else {
    console.log(`Removed ${removedCount} hook(s) from ${SETTINGS_PATH}`);
  }
}

/**
 * Return status information about installed hooks.
 */
export async function getHooksStatus(): Promise<{
  installed: boolean;
  settingsPath: string;
  hooks: { event: string; matcher: string; command: string }[];
}> {
  const settings = await loadSettings();
  const found: { event: string; matcher: string; command: string }[] = [];

  if (settings.hooks) {
    for (const [event, entries] of Object.entries(settings.hooks)) {
      for (const entry of entries) {
        if (isOurHook(entry)) {
          found.push({ event, matcher: entry.matcher, command: entry.command });
        }
      }
    }
  }

  return {
    installed: found.length > 0,
    settingsPath: SETTINGS_PATH,
    hooks: found,
  };
}
