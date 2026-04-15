import { installHooks, uninstallHooks, getHooksStatus } from '../hooks/install.js';

export async function hooksInstall() {
  try {
    await installHooks();
    console.log('\nClaude Code will now auto-sync on session start/end and memory writes.');
    console.log('Restart Claude Code for hooks to take effect.');
  } catch (err) {
    console.error('Failed to install hooks:', (err as Error).message);
    process.exit(1);
  }
}

export async function hooksUninstall() {
  try {
    await uninstallHooks();
    console.log('\nClaude Code hooks removed. Auto-sync disabled.');
  } catch (err) {
    console.error('Failed to uninstall hooks:', (err as Error).message);
    process.exit(1);
  }
}

export async function hooksStatus() {
  try {
    const status = await getHooksStatus();

    console.log(`Settings file: ${status.settingsPath}`);
    console.log(`Hooks installed: ${status.installed ? 'yes' : 'no'}`);

    if (status.hooks.length > 0) {
      console.log('\nActive claude-sync hooks:');
      for (const hook of status.hooks) {
        const matcherLabel = hook.matcher || '(all)';
        console.log(`  ${hook.event} [${matcherLabel}] -> ${hook.command}`);
      }
    } else {
      console.log('\nNo claude-sync hooks found. Run "claude-sync hooks install" to set up.');
    }
  } catch (err) {
    console.error('Failed to read hook status:', (err as Error).message);
    process.exit(1);
  }
}
