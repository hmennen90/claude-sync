import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { deriveKey, encrypt, decrypt, keyFingerprint } from '../crypto/encryption.js';

describe('deriveKey', () => {
  it('produces consistent key from same password and salt', async () => {
    const salt = randomBytes(32);
    const a = await deriveKey('test-password', salt);
    const b = await deriveKey('test-password', salt);
    assert.deepStrictEqual(a.key, b.key);
    assert.deepStrictEqual(a.salt, b.salt);
  });

  it('produces different key from different password', async () => {
    const salt = randomBytes(32);
    const a = await deriveKey('password-one', salt);
    const b = await deriveKey('password-two', salt);
    assert.notDeepStrictEqual(a.key, b.key);
  });
});

describe('encrypt / decrypt', () => {
  it('round-trip works', async () => {
    const { key } = await deriveKey('roundtrip-test');
    const plaintext = Buffer.from('Hello, claude-sync!');
    const ciphertext = encrypt(plaintext, key);
    const decrypted = decrypt(ciphertext, key);
    assert.deepStrictEqual(decrypted, plaintext);
  });

  it('decrypt with wrong key throws', async () => {
    const { key: correctKey } = await deriveKey('correct-password');
    const { key: wrongKey } = await deriveKey('wrong-password');
    const ciphertext = encrypt(Buffer.from('secret data'), correctKey);
    assert.throws(() => decrypt(ciphertext, wrongKey));
  });
});

describe('keyFingerprint', () => {
  it('is consistent for the same key', async () => {
    const { key } = await deriveKey('fp-test');
    const a = keyFingerprint(key);
    const b = keyFingerprint(key);
    assert.strictEqual(a, b);
    assert.strictEqual(typeof a, 'string');
    assert.strictEqual(a.length, 16);
  });

  it('differs for different keys', async () => {
    const { key: keyA } = await deriveKey('fp-test-a');
    const { key: keyB } = await deriveKey('fp-test-b');
    assert.notStrictEqual(keyFingerprint(keyA), keyFingerprint(keyB));
  });
});
