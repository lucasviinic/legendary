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

export function maskKey(key: string): string {
  const prefix = KEY_PREFIX.exec(key)?.[0] ?? '';
  const hidden = key.length - prefix.length - VISIBLE_END;
  if (hidden <= 0) return DOT.repeat(key.length);
  return `${prefix}${DOT.repeat(hidden)}${key.slice(-VISIBLE_END)}`;
}

export class SettingsService {
  private readonly listeners = new Set<() => void>();
  private cached: Settings | null = null;

  constructor(private readonly deps: { repo: SettingsRepository; secrets: SecretStore }) {}

  get(): Settings {
    if (!this.cached) {
      const stored = this.deps.repo.get(SETTINGS_KEY);
      this.cached = SettingsSchema.parse({ ...defaultSettings, ...(stored as object | undefined) });
    }
    return this.cached;
  }

  update(patch: Partial<Settings>): void {
    this.save({ ...this.get(), ...patch, ...(patch.corner ? { cardPlacements: {} } : {}) });
  }

  placeCards(displayKey: string, placement: CardPlacement): void {
    const current = this.get();
    this.save({
      ...current,
      corner: placement.corner,
      cardPlacements: { ...current.cardPlacements, [displayKey]: placement },
    });
  }

  private save(settings: Settings) {
    const parsed = SettingsSchema.parse(settings);
    this.deps.repo.set(SETTINGS_KEY, parsed);
    this.cached = parsed;
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
