import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const CLAUDE_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? '~',
  '.claude'
);
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

const HOOK_MARKER = 'device-sync';

interface HookCommand {
  type: 'command';
  command: string;
}

interface HookEntry {
  matcher: string;
  hooks: HookCommand[];
}

/** Legacy format (pre-2026) had command directly on HookEntry */
interface LegacyHookEntry {
  matcher: string;
  command: string;
}

interface ClaudeSettings {
  hooks?: Record<string, (HookEntry | LegacyHookEntry)[]>;
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
 * The hooks device-sync installs into Claude Code's settings.json.
 */
function getSyncHooks(): Record<string, HookEntry[]> {
  return {
    PreToolUse: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: silentWrap('device-sync pull --memory-only') }],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Write|Edit',
        hooks: [{ type: 'command', command: silentWrap('device-sync push --memory-only') }],
      },
    ],
    SessionStart: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: silentWrap('device-sync pull') }],
      },
    ],
    SessionEnd: [
      {
        matcher: '',
        hooks: [{ type: 'command', command: silentWrap('device-sync push') }],
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
 * Check whether a hook entry was installed by device-sync.
 * Supports both new format (hooks array) and legacy format (command directly).
 */
function isOurHook(entry: HookEntry | LegacyHookEntry): boolean {
  if ('hooks' in entry && Array.isArray(entry.hooks)) {
    return entry.hooks.some((h) => h.command.includes(HOOK_MARKER));
  }
  if ('command' in entry && typeof entry.command === 'string') {
    return entry.command.includes(HOOK_MARKER);
  }
  return false;
}

/**
 * Extract the command string from a hook entry (new or legacy format).
 */
function getHookCommand(entry: HookEntry | LegacyHookEntry): string {
  if ('hooks' in entry && Array.isArray(entry.hooks) && entry.hooks.length > 0) {
    return entry.hooks[0].command;
  }
  if ('command' in entry && typeof entry.command === 'string') {
    return entry.command;
  }
  return '';
}

/**
 * Install device-sync hooks into Claude Code's settings.json.
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

    // Remove any legacy-format device-sync hooks first
    const hadLegacy = settings.hooks[event].some(
      (existing) => isOurHook(existing) && !('hooks' in existing)
    );
    if (hadLegacy) {
      settings.hooks[event] = settings.hooks[event].filter(
        (entry) => !isOurHook(entry)
      );
    }

    for (const newEntry of newEntries) {
      // Skip if we already have this exact hook installed (new format)
      const alreadyExists = settings.hooks[event].some(
        (existing) =>
          isOurHook(existing) &&
          'hooks' in existing &&
          existing.hooks[0]?.command === newEntry.hooks[0]?.command
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
 * Remove all device-sync hooks from Claude Code's settings.json.
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
    console.log('No device-sync hooks found to remove.');
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
          found.push({ event, matcher: entry.matcher, command: getHookCommand(entry) });
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
