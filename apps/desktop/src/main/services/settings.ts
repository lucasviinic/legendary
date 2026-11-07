import { randomBytes } from 'node:crypto';
import {
  ProviderSchema,
  SettingsSchema,
  defaultSettings,
  type ApiKeyInfo,
  type ApiKeyStatus,
  type CardPlacement,
  type Provider,
  type Settings,
} from '@legendary/contracts';
import type { SettingsRepository } from '../db/repositories/settings';
import type { SecretStore } from './secrets';

const SETTINGS_KEY = 'app';
const TOKEN_KEY = 'ws_token';
const STATUS_KEY = 'key_status';

const KEY_PREFIX = /^(sk-ant-|sk-|AIza)/;
const DOT = '•';
const VISIBLE_END = 4;

/** Mostra só o começo fixo da chave e os últimos caracteres, como no mockup. */
export function maskKey(key: string): string {
  const prefix = KEY_PREFIX.exec(key)?.[0] ?? '';
  const hidden = key.length - prefix.length - VISIBLE_END;
  if (hidden <= 0) return DOT.repeat(key.length);
  return `${prefix}${DOT.repeat(hidden)}${key.slice(-VISIBLE_END)}`;
}

export class SettingsService {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: { repo: SettingsRepository; secrets: SecretStore }) {}

  get(): Settings {
    const stored = this.deps.repo.get(SETTINGS_KEY);
    return SettingsSchema.parse({ ...defaultSettings, ...(stored as object | undefined) });
  }

  /** Escolher um canto, mesmo o atual, apaga as posições arrastadas e volta ao padrão. */
  update(patch: Partial<Settings>): void {
    this.save({ ...this.get(), ...patch, ...(patch.corner ? { cardPlacements: {} } : {}) });
  }

  /** Guarda a posição arrastada neste monitor. As dos outros monitores continuam valendo. */
  placeCards(displayKey: string, placement: CardPlacement): void {
    const current = this.get();
    this.save({
      ...current,
      corner: placement.corner,
      cardPlacements: { ...current.cardPlacements, [displayKey]: placement },
    });
  }

  private save(settings: Settings) {
    this.deps.repo.set(SETTINGS_KEY, SettingsSchema.parse(settings));
    this.notify();
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  pairingToken(): string {
    const stored = this.deps.repo.get(TOKEN_KEY);
    if (typeof stored === 'string') return stored;
    const token = randomBytes(32).toString('hex');
    this.deps.repo.set(TOKEN_KEY, token);
    return token;
  }

  apiKey(provider: Provider): string | null {
    return this.deps.secrets.get(provider);
  }

  setApiKey(provider: Provider, key: string): void {
    this.deps.secrets.set(provider, key);
    this.setKeyStatus(provider, 'untested');
  }

  setKeyStatus(provider: Provider, status: ApiKeyStatus): void {
    this.deps.repo.set(STATUS_KEY, { ...this.statuses(), [provider]: status });
    this.notify();
  }

  keyInfo(): Record<Provider, ApiKeyInfo> {
    const statuses = this.statuses();
    const info = (provider: Provider): ApiKeyInfo => {
      const key = this.apiKey(provider);
      if (!key) return { mask: null, status: 'missing' };
      return { mask: maskKey(key), status: statuses[provider] ?? 'untested' };
    };
    return Object.fromEntries(
      ProviderSchema.options.map((provider) => [provider, info(provider)]),
    ) as Record<Provider, ApiKeyInfo>;
  }

  private statuses(): Partial<Record<Provider, ApiKeyStatus>> {
    return (this.deps.repo.get(STATUS_KEY) ?? {}) as Partial<Record<Provider, ApiKeyStatus>>;
  }
}
