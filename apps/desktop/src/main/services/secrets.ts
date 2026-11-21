import type { Provider } from '@legendary/contracts';

export interface SecretStore {
  get(provider: Provider): string | null;
  set(provider: Provider, key: string): void;
}
