---
name: device-sync-remind
description: Set and manage cross-device reminders for Claude Code. Use when the user wants to create a reminder, check pending reminders, or manage the reminder daemon.
disable-model-invocation: false
allowed-tools: Bash
---

# Device Sync - Reminders

Set and manage reminders that sync across all devices.

## Set a Reminder

```bash
# Relative time
device-sync remind "30m" "Check deployment status"
device-sync remind "2h" "Review PR feedback"
device-sync remind "1d" "Follow up with team"

# Absolute time (German and English supported)
device-sync remind "morgen 9:00" "Standup vorbereiten"
device-sync remind "tomorrow 14:30" "Release meeting"

# With webhook notification
device-sync remind "1h" "Deploy to staging" --webhook https://hooks.example.com/notify
```

## View Reminders

```bash
# Show all pending reminders
device-sync reminders

# Show only due reminders
device-sync reminders --due

# Dismiss all due reminders
device-sync reminders --dismiss
```

## Daemon (Background Checker)

The daemon periodically checks for due reminders and fires webhooks:

```bash
# Start the daemon (cron job, checks every 5 minutes)
device-sync daemon start

# Stop the daemon
device-sync daemon stop

# Run a single check manually
device-sync daemon check

# Show daemon status
device-sync daemon status

# View daemon logs
device-sync daemon log
```

## Notes

- Reminders are encrypted and stored in the sync repository
- Due reminders are shown automatically when running `device-sync pull`
- Webhook payloads include: message, dueAt, username, id
