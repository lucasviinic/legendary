import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { safeStorage } from 'electron';
import type { Provider } from '@legendary/contracts';
import type { SecretStore } from './secrets';

export function createSafeStorageSecrets(filePath: string): SecretStore {
  const read = (): Partial<Record<Provider, string>> =>
    existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : {};

  return {
    get(provider) {
      const encrypted = read()[provider];
      if (!encrypted) return null;
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch {
        return null;
      }
    },
    set(provider, key) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('O Keychain não está disponível para guardar a chave.');
      }
      const next = { ...read(), [provider]: safeStorage.encryptString(key).toString('base64') };
      writeFileSync(filePath, JSON.stringify(next), { mode: 0o600 });
      chmodSync(filePath, 0o600);
    },
  };
}
