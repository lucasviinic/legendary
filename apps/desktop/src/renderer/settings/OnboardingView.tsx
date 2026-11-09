import type { Provider, Settings, SettingsView as View } from '@legendary/contracts';
import { TrafficLights } from '../shared/TrafficLights';
import { Row, Segmented } from './controls';
import { KeyRow, LEVEL_HINTS, LEVELS, PairingRow, PROVIDERS } from './SettingsView';

export interface OnboardingViewProps {
  view: View;
  onChange?: (patch: Partial<Settings>) => void;
  onSaveKey?: (provider: Provider, key: string) => void;
  onFinish?: () => void;
}

/** Configuração da primeira vez: frame 2e. */
export function OnboardingView({ view, onChange, onSaveKey, onFinish }: OnboardingViewProps) {
  const { settings } = view;
  const hasKey = view.keys[settings.provider].status !== 'missing';
  return (
    <div className="bg-surface text-[13px] text-white">
      <div className="drag flex h-[38px] items-center px-3.5">
        <TrafficLights />
      </div>
      <div className="flex flex-col gap-[18px] px-[26px] pt-2 pb-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[22px] font-semibold tracking-[-0.2px]">
            Vamos configurar o Legendary
          </span>
          <span className="text-white/60">
            Você usa sua própria chave de IA. Ela fica guardada no Keychain do Mac.
          </span>
        </div>
        <Row label="Provedor de IA">
          <Segmented
            options={PROVIDERS}
            value={settings.provider}
            onChange={(provider) => onChange?.({ provider })}
          />
        </Row>
        <KeyRow
          provider={settings.provider}
          view={view}
          onSaveKey={(key) => onSaveKey?.(settings.provider, key)}
        />
        <Row label="Seu nível">
          <div className="flex items-center gap-3">
            <Segmented
              options={LEVELS}
              value={settings.level}
              itemClass="w-11"
              onChange={(level) => onChange?.({ level })}
            />
            <span className="text-[12px] text-white/50">{LEVEL_HINTS[settings.level]}</span>
          </div>
        </Row>
        <PairingRow view={view} />
        <span className="pl-[164px] text-[12px] leading-[1.45] text-white/50">
          Instale a extensão no Chrome e cole este código no popup dela para ler as legendas da
          Netflix e do YouTube.
        </span>
        <div className="flex items-center justify-end gap-2.5 pt-1">
          {!hasKey && <span className="text-[12px] text-white/45">Falta a chave da API</span>}
          <button
            disabled={!hasKey}
            onClick={onFinish}
            className="flex h-[34px] items-center rounded-[9px] bg-white px-[18px] font-semibold text-ink disabled:opacity-40"
          >
            Começar
          </button>
        </div>
      </div>
    </div>
  );
}
