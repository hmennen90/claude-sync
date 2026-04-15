---
name: device-sync-status
description: Show device-sync status, manage hooks, and configure team settings. Use when the user asks about sync status, wants to add team members, or manage hook integration.
disable-model-invocation: false
allowed-tools: Bash
---

# Device Sync - Status & Configuration

## Status

Show current sync configuration, registered devices, and connection status:

```bash
device-sync status
```

## Hook Management

Hooks enable automatic push/pull on session start/end:

```bash
# Install auto-sync hooks
device-sync hooks install

# Remove hooks
device-sync hooks uninstall

# Show hook status
device-sync hooks status
```

## Team Management

Add team members to share sessions and memory (team mode only):

```bash
# Add a team member
device-sync team add <username>

# Add with role
device-sync team add <username> --role owner
```

## Troubleshooting

If sync is not working:

1. Check status: `device-sync status`
2. Verify hooks: `device-sync hooks status`
3. Try manual pull: `device-sync pull`
4. Ensure the Git repo is accessible: check SSH keys or tokens
