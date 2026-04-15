import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import argon2 from 'argon2';

const ALGORITHM = 'chacha20-poly1305';
const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// Argon2id parameters (OWASP recommended)
const ARGON2_TIME_COST = 3;
const ARGON2_MEMORY_COST = 65536; // 64 MB
const ARGON2_PARALLELISM = 4;

export interface DerivedKey {
  key: Buffer;
  salt: Buffer;
}

/**
 * Derive a 256-bit encryption key from a password using Argon2id.
 * If salt is provided, uses it (for existing repos). Otherwise generates a new one.
 */
export async function deriveKey(password: string, salt?: Buffer): Promise<DerivedKey> {
  const usedSalt = salt ?? randomBytes(SALT_LENGTH);

  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    timeCost: ARGON2_TIME_COST,
    memoryCost: ARGON2_MEMORY_COST,
    parallelism: ARGON2_PARALLELISM,
    salt: usedSalt,
    hashLength: KEY_LENGTH,
    raw: true,
  });

  return {
    key: Buffer.from(hash),
    salt: usedSalt,
  };
}

/**
 * Encrypt plaintext data using XChaCha20-Poly1305.
 * Returns: nonce (12 bytes) + authTag (16 bytes) + ciphertext
 */
export function encrypt(data: Buffer, key: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([nonce, authTag, encrypted]);
}

/**
 * Decrypt data encrypted with encrypt().
 * Expects: nonce (12 bytes) + authTag (16 bytes) + ciphertext
 */
export function decrypt(data: Buffer, key: Buffer): Buffer {
  const nonce = data.subarray(0, NONCE_LENGTH);
  const authTag = data.subarray(NONCE_LENGTH, NONCE_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(NONCE_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Quick fingerprint of the derived key — used to verify password matches
 * without storing the key itself. Stored in the repo as verification.
 */
export function keyFingerprint(key: Buffer): string {
  return createHash('sha256').update(key).update('claude-sync-verify').digest('hex').slice(0, 16);
}
