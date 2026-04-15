# claude-device-sync

Cross-device session storage, shared memory, and reminders for [Claude Code](https://claude.com/claude-code).

Sync your Claude Code sessions, memory, and reminders across multiple devices — encrypted, via a private Git repo. Works solo or with a team.

## Features

- **Session Sync** — Save and resume full Claude Code sessions from any device
- **Shared Memory** — Sync Claude Code memory files across machines
- **Reminders** — Set time-based reminders with DE/EN time parsing and optional webhook notifications
- **Team Mode** — Share sessions, memory, and reminders with team members
- **End-to-End Encryption** — Argon2id key derivation + ChaCha20-Poly1305, password-based
- **Auto-Sync Hooks** — Automatically push/pull on session start/end
- **Reminder Daemon** — Background cron job for webhook notifications (macOS launchd + Linux crontab)

## Install

```bash
npm install -g claude-device-sync
```

**Requirements:** Node.js 20+, Git, a private Git repository (GitHub, GitLab, etc.)

## Quick Start

```bash
# 1. Initialize with your private repo
device-sync init git@github.com:you/your-sync-repo.git

# 2. Install auto-sync hooks into Claude Code
device-sync hooks install

# 3. Done! Sessions and memory sync automatically.
```

## Usage

### Session Sync

```bash
# Push current session + memory
device-sync push

# Pull latest from remote
device-sync pull

# Resume the latest session (from any device)
device-sync resume

# List all synced sessions
device-sync sessions

# Resume a specific user's session (team mode)
device-sync resume --user colleague
```

### Reminders

```bash
# Set a reminder
device-sync remind 30m "Check deploy status"
device-sync remind 2h "Review PR"
device-sync remind "morgen 9:00" "Standup prep"
device-sync remind 1d "Release notes" --webhook https://hooks.slack.com/...

# View reminders
device-sync reminders
device-sync reminders --due
device-sync reminders --dismiss
```

### Team Mode

```bash
# Initialize in team mode
device-sync init git@github.com:team/shared-sync.git --mode team --username alice

# On another device / team member
device-sync init git@github.com:team/shared-sync.git --mode team --username bob

# Add a team member
device-sync team add charlie

# All sessions and memory are visible to all team members
device-sync sessions --user bob
device-sync resume --user alice
```

### Hooks (Auto-Sync)

```bash
# Install hooks into Claude Code settings
device-sync hooks install

# Check hook status
device-sync hooks status

# Remove hooks
device-sync hooks uninstall
```

Installed hooks:
| Event | Trigger | Action |
|-------|---------|--------|
| SessionStart | Always | `device-sync pull` |
| SessionEnd | Always | `device-sync push` |
| PostToolUse | Write/Edit | `device-sync push --memory-only` |
| PreToolUse | Always | `device-sync pull --memory-only` |

### Reminder Daemon

```bash
# Install background checker (fires webhooks for due reminders)
device-sync daemon start

# Check status
device-sync daemon status

# View logs
device-sync daemon log

# Stop daemon
device-sync daemon stop
```

### Maintenance

```bash
# View sync status
device-sync status

# Purge old sessions (default: >30 days)
device-sync purge
device-sync purge --days 14
device-sync purge --dry-run

# Purge old reminders
device-sync reminders --dismiss
```

## Security

- **Encryption:** All data is encrypted with ChaCha20-Poly1305 before being committed to Git
- **Key Derivation:** Argon2id (memory-hard, 64 MB, 3 iterations) from your password
- **No plaintext ever touches the repo** — session data, memory files, and reminders are all `.enc` blobs
- **Password never stored** — only the derived key, cached in your OS keychain (macOS Keychain, Linux libsecret, Windows Credential Vault)
- **Verification:** A key fingerprint (truncated SHA-256) is stored in the repo to verify password correctness on new devices without exposing the key

## How It Works

```
Your Password
    ↓ Argon2id + salt (stored in repo)
256-bit Key (stored in OS keychain)
    ↓ ChaCha20-Poly1305
Encrypted .enc files → committed to private Git repo
```

Repo structure:
```
device-sync-repo/
├── config.json              # Sync config (mode, devices, team members)
├── sessions/
│   ├── latest.enc           # Pointer to most recent session
│   └── {user}/{device}/     # Encrypted session files
├── memory/
│   ├── {user}/{project}/    # Personal memory files
│   └── shared/{project}/    # Team-shared memory (team mode)
└── reminders/
    └── pending.enc          # Encrypted reminder list
```

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | Full support | Keychain + launchd daemon |
| Linux | Full support | libsecret + crontab daemon |
| Windows | Full support | Credential Vault + Task Scheduler daemon |

## Troubleshooting

### `GitConstructError: Cannot use simple-git on a directory that does not exist`

Fixed in 0.2.1. If you're on an older version, the `init` command would crash when `~/.device-sync/repo` did not yet exist because `GitSync` instantiated `simple-git` against the not-yet-cloned directory. Upgrade with `npm install -g claude-device-sync@latest`, or as a workaround pre-create the directory (`mkdir ~/.device-sync/repo`) before running `init`.

## License

MIT
