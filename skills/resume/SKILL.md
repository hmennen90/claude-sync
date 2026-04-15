---
name: device-sync-resume
description: Resume a previous Claude Code session from another device. Use when the user wants to continue work from a different device, load a previous session, or pick up where they left off.
disable-model-invocation: false
allowed-tools: Bash
---

# Device Sync - Resume Session

Resume a previous Claude Code session from any synced device.

## Usage

```bash
# Resume the latest session from any device
device-sync resume

# Resume session from a specific team member
device-sync resume --user <username>

# Resume session for a specific project
device-sync resume --project <path>
```

## How It Works

1. Pulls the latest sync state from the repository
2. Finds the most recent matching session
3. Decrypts and displays the session content
4. You can then use the session context to continue the conversation

## List Available Sessions

Before resuming, you can browse available sessions:

```bash
device-sync sessions
```

This shows session ID, user, device, project path, and last update time.
