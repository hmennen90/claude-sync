import keytar from 'keytar';

const SERVICE_NAME = 'claude-sync';

/**
 * Store the encryption key in the OS keychain.
 * - macOS: Keychain
 * - Linux: libsecret
 * - Windows: Credential Vault
 */
export async function storeKey(repoId: string, key: Buffer): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, repoId, key.toString('base64'));
}

/**
 * Retrieve the encryption key from the OS keychain.
 */
export async function retrieveKey(repoId: string): Promise<Buffer | null> {
  const stored = await keytar.getPassword(SERVICE_NAME, repoId);
  if (!stored) return null;
  return Buffer.from(stored, 'base64');
}

/**
 * Remove the stored key (for password change or cleanup).
 */
export async function removeKey(repoId: string): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, repoId);
}
