---
name: device-sync-setup
description: Initialize device-sync for cross-device session and memory synchronization. Use when the user wants to set up device sync, connect a sync repository, or configure encrypted cross-device syncing.
disable-model-invocation: false
allowed-tools: Bash
---

# Device Sync Setup

Help the user initialize device-sync for cross-device Claude Code synchronization.

## Prerequisites

Ensure `device-sync` is installed globally:

```bash
npm install -g claude-device-sync
```

If not installed, install it first.

## Setup Steps

1. **Ask for a Git repository URL** - The user needs a private Git repo for encrypted storage. If they don't have one, suggest creating a private repo on GitHub (e.g., `my-claude-sync`).

2. **Choose mode** - Ask if they want `personal` (single user, multiple devices) or `team` (multiple users sharing sessions).

3. **Run init**:
   - Personal: `device-sync init <repo-url>`
   - Team: `device-sync init <repo-url> --mode team --username <name>`

4. **Set a passphrase** - The tool will prompt for an encryption passphrase. This passphrase must be the same on all devices.

5. **Install hooks** - Run `device-sync hooks install` to enable automatic sync on session start/end.

6. **Verify** - Run `device-sync status` to confirm everything is configured.

## Important Notes

- The Git repo MUST be private - it stores encrypted session data
- The passphrase is stored in the OS keychain (macOS Keychain, Linux libsecret, Windows Credential Vault)
- On additional devices, run the same `init` command with the same repo URL and passphrase
