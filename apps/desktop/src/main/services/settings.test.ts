import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { defaultSettings, type Settings } from '@legendary/contracts';
import { openDatabase } from '../db/client';
import { createRepositories } from '../db/repositories';
import type { SettingsRepository } from '../db/repositories/settings';
import { memorySecrets } from '../test/harness';
import { maskKey, SettingsService } from './settings';

let close: () => void;
let repo: SettingsRepository;
let service: SettingsService;

beforeEach(() => {
  const opened = openDatabase(':memory:', join(__dirname, '../../../../../packages/db/migrations'));
  close = opened.close;
  repo = createRepositories(opened.db).settings;
  service = new SettingsService({ repo, secrets: memorySecrets() });
});
afterEach(() => close());

describe('SettingsService', () => {
  it('starts with the defaults', () => {
    expect(service.get()).toMatchObject({
      level: 'B2',
      corner: 'tr',
      cardsPerMinute: 2,
      onboarded: false,
    });
  });

  it('saves a partial change', () => {
    service.update({ level: 'C1' });
    expect(service.get()).toMatchObject({ level: 'C1', corner: 'tr' });
  });

  it('reports changes', () => {
    const listener = vi.fn();
    service.onChange(listener);
    service.update({ corner: 'bl' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe('card position', () => {
    const placed = { corner: 'tr' as const, x: 20, y: 12 };

    it('starts with no dragged position', () => {
      expect(service.get().cardPlacements).toEqual({});
    });

    it('remembers the position for each monitor', () => {
      service.placeCards('27G2G5', placed);
      service.placeCards('Tela Retina Integrada', { corner: 'tl', x: 1, y: 2 });
      expect(service.get().cardPlacements).toEqual({
        '27G2G5': placed,
        'Tela Retina Integrada': { corner: 'tl', x: 1, y: 2 },
      });
    });

    it('shows the corner of the last drag in the settings', () => {
      service.placeCards('27G2G5', { corner: 'bl', x: 1, y: 2 });
      expect(service.get().corner).toBe('bl');
    });

    it('reports the change', () => {
      const listener = vi.fn();
      service.onChange(listener);
      service.placeCards('27G2G5', placed);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('forgets the dragged positions when a corner is chosen', () => {
      service.placeCards('27G2G5', placed);
      service.update({ corner: 'bl' });
      expect(service.get()).toMatchObject({ corner: 'bl', cardPlacements: {} });
    });

    it('forgets them even when the chosen corner is the current one', () => {
      service.placeCards('27G2G5', placed);
      service.update({ corner: 'tr' });
      expect(service.get().cardPlacements).toEqual({});
    });

    it('keeps them when another setting changes', () => {
      service.placeCards('27G2G5', placed);
      service.update({ level: 'C1' });
      expect(service.get().cardPlacements).toEqual({ '27G2G5': placed });
    });

    it('reads settings saved before this option existed', () => {
      const legacy = { ...defaultSettings } as Partial<Settings>;
      delete legacy.cardPlacements;
      repo.set('app', legacy);
      expect(service.get().cardPlacements).toEqual({});
    });
  });

  it('generates the pairing token once', () => {
    const token = service.pairingToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(service.pairingToken()).toBe(token);
  });

  it('never exposes the key, only a mask', () => {
    service.setApiKey('claude', 'sk-ant-abcdefghijklmnop3f9a');
    const view = JSON.stringify(service.keyInfo());
    expect(view).not.toContain('abcdefghijklmnop');
    expect(service.keyInfo().claude).toMatchObject({ status: 'untested' });
    expect(service.keyInfo().claude.mask).toContain('3f9a');
  });

  it('keeps the key available for the main process', () => {
    service.setApiKey('gemini', 'AIzaSECRET');
    expect(service.apiKey('gemini')).toBe('AIzaSECRET');
  });

  it('marks a provider without a key as missing', () => {
    expect(service.keyInfo().deepseek).toEqual({ mask: null, status: 'missing' });
  });

  it('records the result of testing a key', () => {
    service.setApiKey('gemini', 'AIzaSECRET');
    service.setKeyStatus('gemini', 'ok');
    expect(service.keyInfo().gemini.status).toBe('ok');
  });

  it('forgets the test result when the key changes', () => {
    service.setApiKey('gemini', 'AIzaSECRET');
    service.setKeyStatus('gemini', 'ok');
    service.setApiKey('gemini', 'AIzaOTHER');
    expect(service.keyInfo().gemini.status).toBe('untested');
  });
});

describe('maskKey', () => {
  it('keeps the prefix and the last four characters, like the mockup', () => {
    expect(maskKey('sk-ant-abcdefghijklmnop3f9a')).toBe('sk-ant-••••••••••••••••3f9a');
    expect(maskKey('AIzaSyabcdefghij7Qk0')).toBe('AIza••••••••••••7Qk0');
    expect(maskKey('sk-abcdefghijb21c')).toBe('sk-••••••••••b21c');
  });

  it('hides a short key completely', () => {
    expect(maskKey('abcd')).toBe('••••');
  });
});
