# claude-sync

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
npm install -g claude-sync
```

**Requirements:** Node.js 20+, Git, a private Git repository (GitHub, GitLab, etc.)

## Quick Start

```bash
# 1. Initialize with your private repo
claude-sync init git@github.com:you/your-sync-repo.git

# 2. Install auto-sync hooks into Claude Code
claude-sync hooks install

# 3. Done! Sessions and memory sync automatically.
```

## Usage

### Session Sync

```bash
# Push current session + memory
claude-sync push

# Pull latest from remote
claude-sync pull

# Resume the latest session (from any device)
claude-sync resume

# List all synced sessions
claude-sync sessions

# Resume a specific user's session (team mode)
claude-sync resume --user colleague
```

### Reminders

```bash
# Set a reminder
claude-sync remind 30m "Check deploy status"
claude-sync remind 2h "Review PR"
claude-sync remind "morgen 9:00" "Standup prep"
claude-sync remind 1d "Release notes" --webhook https://hooks.slack.com/...

# View reminders
claude-sync reminders
claude-sync reminders --due
claude-sync reminders --dismiss
```

### Team Mode

```bash
# Initialize in team mode
claude-sync init git@github.com:team/shared-sync.git --mode team --username alice

# On another device / team member
claude-sync init git@github.com:team/shared-sync.git --mode team --username bob

# Add a team member
claude-sync team add charlie

# All sessions and memory are visible to all team members
claude-sync sessions --user bob
claude-sync resume --user alice
```

### Hooks (Auto-Sync)

```bash
# Install hooks into Claude Code settings
claude-sync hooks install

# Check hook status
claude-sync hooks status

# Remove hooks
claude-sync hooks uninstall
```

Installed hooks:
| Event | Trigger | Action |
|-------|---------|--------|
| SessionStart | Always | `claude-sync pull` |
| SessionEnd | Always | `claude-sync push` |
| PostToolUse | Write/Edit | `claude-sync push --memory-only` |
| PreToolUse | Always | `claude-sync pull --memory-only` |

### Reminder Daemon

```bash
# Install background checker (fires webhooks for due reminders)
claude-sync daemon start

# Check status
claude-sync daemon status

# View logs
claude-sync daemon log

# Stop daemon
claude-sync daemon stop
```

### Maintenance

```bash
# View sync status
claude-sync status

# Purge old sessions (default: >30 days)
claude-sync purge
claude-sync purge --days 14
claude-sync purge --dry-run

# Purge old reminders
claude-sync reminders --dismiss
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
claude-sync-repo/
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

## License

MIT
