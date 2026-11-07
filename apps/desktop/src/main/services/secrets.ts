import type { Provider } from '@legendary/contracts';

/** Guarda as API keys fora do banco. A implementação real usa o safeStorage do Electron. */
export interface SecretStore {
  get(provider: Provider): string | null;
  set(provider: Provider, key: string): void;
}
