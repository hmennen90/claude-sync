import { encrypt, decrypt } from '../crypto/encryption.js';
import { GitSync } from '../git/sync.js';

export interface Reminder {
  id: string;
  username: string;
  deviceId: string;
  message: string;
  createdAt: string;
  dueAt: string;
  dismissed: boolean;
  webhook?: string; // Optional webhook URL for notifications
}

const REMINDERS_PATH = 'reminders/pending.enc';

export class ReminderManager {
  constructor(
    private sync: GitSync,
    private key: Buffer,
    private username: string,
    private deviceId: string,
  ) {}

  /**
   * Load all reminders from the sync repo.
   */
  private async loadAll(): Promise<Reminder[]> {
    const raw = await this.sync.readFile(REMINDERS_PATH);
    if (!raw) return [];

    try {
      return JSON.parse(decrypt(raw, this.key).toString());
    } catch {
      return [];
    }
  }

  /**
   * Save all reminders to the sync repo.
   */
  private async saveAll(reminders: Reminder[]): Promise<void> {
    const data = Buffer.from(JSON.stringify(reminders, null, 2));
    await this.sync.writeFile(REMINDERS_PATH, encrypt(data, this.key));
  }

  /**
   * Add a new reminder.
   */
  async add(message: string, dueAt: Date, webhook?: string): Promise<Reminder> {
    const reminders = await this.loadAll();

    const reminder: Reminder = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username: this.username,
      deviceId: this.deviceId,
      message,
      createdAt: new Date().toISOString(),
      dueAt: dueAt.toISOString(),
      dismissed: false,
      webhook,
    };

    reminders.push(reminder);
    await this.saveAll(reminders);
    return reminder;
  }

  /**
   * Get all pending (not dismissed) reminders for this user.
   */
  async getPending(): Promise<Reminder[]> {
    const reminders = await this.loadAll();
    return reminders.filter(r =>
      r.username === this.username && !r.dismissed
    );
  }

  /**
   * Get due reminders (dueAt <= now).
   */
  async getDue(): Promise<Reminder[]> {
    const now = new Date();
    const pending = await this.getPending();
    return pending.filter(r => new Date(r.dueAt) <= now);
  }

  /**
   * Dismiss a reminder by ID.
   */
  async dismiss(id: string): Promise<void> {
    const reminders = await this.loadAll();
    const reminder = reminders.find(r => r.id === id);
    if (reminder) {
      reminder.dismissed = true;
      await this.saveAll(reminders);
    }
  }

  /**
   * Dismiss all due reminders and return them.
   */
  async dismissDue(): Promise<Reminder[]> {
    const reminders = await this.loadAll();
    const now = new Date();
    const due: Reminder[] = [];

    for (const r of reminders) {
      if (r.username === this.username && !r.dismissed && new Date(r.dueAt) <= now) {
        r.dismissed = true;
        due.push(r);
      }
    }

    await this.saveAll(reminders);
    return due;
  }

  /**
   * Remove old dismissed reminders (cleanup).
   */
  async purge(olderThanDays: number = 30): Promise<number> {
    const reminders = await this.loadAll();
    const cutoff = new Date(Date.now() - olderThanDays * 86400000);
    const before = reminders.length;

    const kept = reminders.filter(r =>
      !r.dismissed || new Date(r.dueAt) > cutoff
    );

    await this.saveAll(kept);
    return before - kept.length;
  }
}

/**
 * Parse a human-friendly duration/time string into a Date.
 * Supports: "30m", "2h", "1d", "morgen 9:00", "2026-04-20 14:00"
 */
export function parseReminderTime(input: string): Date {
  const now = new Date();

  // Relative: 30m, 2h, 1d, 3w
  const relMatch = input.match(/^(\d+)\s*(m|min|h|hr|d|day|w|week)s?$/i);
  if (relMatch) {
    const amount = parseInt(relMatch[1]);
    const unit = relMatch[2].toLowerCase();
    const ms = {
      m: 60000, min: 60000,
      h: 3600000, hr: 3600000,
      d: 86400000, day: 86400000,
      w: 604800000, week: 604800000,
    }[unit] ?? 60000;

    return new Date(now.getTime() + amount * ms);
  }

  // "morgen" or "tomorrow" with optional time
  const morgenMatch = input.match(/^(morgen|tomorrow)\s*(\d{1,2}:\d{2})?$/i);
  if (morgenMatch) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (morgenMatch[2]) {
      const [h, m] = morgenMatch[2].split(':').map(Number);
      tomorrow.setHours(h, m, 0, 0);
    } else {
      tomorrow.setHours(9, 0, 0, 0);
    }
    return tomorrow;
  }

  // ISO or date-like string
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) return parsed;

  throw new Error(`Cannot parse reminder time: "${input}"`);
}
