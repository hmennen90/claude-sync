---
name: device-sync
description: Sync Claude Code sessions and memory across devices. Use when the user wants to push or pull sessions, sync memory files, or manage cross-device synchronization.
disable-model-invocation: false
allowed-tools: Bash
---

# Device Sync - Push & Pull

Manage cross-device synchronization of Claude Code sessions and memory.

## Push (Upload)

Push the current session and memory to the sync repository:

```bash
# Push everything (session + memory)
device-sync push

# Push only memory files
device-sync push --memory-only

# Push only the current session
device-sync push --session-only
```

## Pull (Download)

Pull the latest state from the sync repository:

```bash
# Pull everything
device-sync pull

# Pull only memory files
device-sync pull --memory-only
```

## Status

Check the current sync status, registered devices, and configuration:

```bash
device-sync status
```

## Sessions

List all synced sessions across devices:

```bash
# List all sessions
device-sync sessions

# Filter by user (team mode)
device-sync sessions --user <username>

# Filter by project
device-sync sessions --project <path>
```

## Purge

Delete old sessions to free space:

```bash
# Delete sessions older than 30 days (default)
device-sync purge

# Custom retention period
device-sync purge --days 7

# Preview what would be deleted
device-sync purge --dry-run
```

## Notes

- Push/pull is automatic when hooks are installed (`device-sync hooks install`)
- Memory sync only affects the current project's memory directory
- Sessions are encrypted with ChaCha20-Poly1305 before being stored
