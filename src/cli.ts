#!/usr/bin/env node

import { Command } from 'commander';
import { init } from './commands/init.js';
import { push } from './commands/push.js';
import { pull } from './commands/pull.js';
import { resume } from './commands/resume.js';
import { remind, reminders } from './commands/remind.js';
import { sessions } from './commands/sessions.js';
import { status } from './commands/status.js';
import { teamAdd } from './commands/team.js';
import { hooksInstall, hooksUninstall, hooksStatus } from './commands/hooks.js';
import { daemonStart, daemonStop, daemonCheck, daemonStatus, daemonLog } from './commands/daemon.js';
import { purge } from './commands/purge.js';

const program = new Command();

program
  .name('device-sync')
  .description('Cross-device session storage, shared memory, and reminders for Claude Code')
  .version('0.2.0');

program
  .command('init')
  .description('Initialize sync with a git repo')
  .argument('<repo-url>', 'Git repository URL (must be private!)')
  .option('-m, --mode <mode>', 'Sync mode: personal or team', 'personal')
  .option('-u, --username <name>', 'Your username (required for team mode)')
  .action(init);

program
  .command('push')
  .description('Push current session + memory to sync repo')
  .option('-s, --session <path>', 'Path to Claude Code session file')
  .option('--memory-only', 'Only sync memory files')
  .option('--session-only', 'Only sync session')
  .action(push);

program
  .command('pull')
  .description('Pull latest state from sync repo')
  .option('--memory-only', 'Only pull memory files')
  .action(pull);

program
  .command('resume')
  .description('Resume the latest session from any device')
  .option('-u, --user <username>', 'Resume session from specific team member')
  .option('-p, --project <path>', 'Resume session for specific project')
  .action(resume);

program
  .command('sessions')
  .description('List all synced sessions')
  .option('-u, --user <username>', 'Filter by username')
  .option('-p, --project <path>', 'Filter by project')
  .action(sessions);

program
  .command('remind')
  .description('Set a reminder')
  .argument('<when>', 'When to remind: 30m, 2h, 1d, morgen 9:00, etc.')
  .argument('<message...>', 'Reminder message')
  .option('-w, --webhook <url>', 'Webhook URL for push notification')
  .action(remind);

program
  .command('reminders')
  .description('Show pending and due reminders')
  .option('--due', 'Show only due reminders')
  .option('--dismiss', 'Dismiss all due reminders')
  .action(reminders);

program
  .command('status')
  .description('Show sync status')
  .action(status);

program
  .command('team')
  .description('Team management')
  .command('add')
  .argument('<username>', 'Username to add')
  .option('-r, --role <role>', 'Role: owner or member', 'member')
  .action(teamAdd);

const hooksCmd = program
  .command('hooks')
  .description('Manage Claude Code hook integration');

hooksCmd
  .command('install')
  .description('Install auto-sync hooks into Claude Code settings')
  .action(hooksInstall);

hooksCmd
  .command('uninstall')
  .description('Remove auto-sync hooks from Claude Code settings')
  .action(hooksUninstall);

hooksCmd
  .command('status')
  .description('Show which claude-sync hooks are active')
  .action(hooksStatus);

const daemonCmd = program
  .command('daemon')
  .description('Manage the reminder webhook daemon');

daemonCmd
  .command('start')
  .description('Install a system cron job to check reminders every 5 minutes')
  .action(daemonStart);

daemonCmd
  .command('stop')
  .description('Remove the system cron job')
  .action(daemonStop);

daemonCmd
  .command('check')
  .description('Run a single reminder check now')
  .action(daemonCheck);

daemonCmd
  .command('status')
  .description('Show if the daemon is installed and running')
  .action(daemonStatus);

daemonCmd
  .command('log')
  .description('Show the last 50 lines of the daemon log')
  .action(daemonLog);

program
  .command('purge')
  .description('Delete old sessions to free space')
  .option('--days <number>', 'Delete sessions older than N days (default: 30)')
  .option('--dry-run', 'Show what would be deleted without deleting')
  .action(purge);

program.parse();
