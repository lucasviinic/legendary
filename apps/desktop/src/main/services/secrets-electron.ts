import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { safeStorage } from 'electron';
import type { Provider } from '@legendary/contracts';
import type { SecretStore } from './secrets';

/** Cifra as chaves com o safeStorage, cuja chave de cifragem fica no Keychain do macOS. */
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
        // Keychain negado ou chave de outra instalação: para o app, é o mesmo que não ter chave.
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
