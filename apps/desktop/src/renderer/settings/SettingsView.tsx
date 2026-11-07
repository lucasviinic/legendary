import type { Corner, Level, Provider, Settings, SettingsView as View } from '@legendary/contracts';
import { useState } from 'react';
import { TrafficLights } from '../shared/TrafficLights';
import {
  CARD_STOPS,
  CARD_TIME_STOPS,
  KeyField,
  Row,
  Segmented,
  StepSlider,
  SUMMARY_STOPS,
  Toggle,
} from './controls';

export const PROVIDERS = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'claude', label: 'Claude' },
  { value: 'deepseek', label: 'DeepSeek' },
] as const satisfies readonly { value: Provider; label: string }[];

export const LEVELS = [
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
] as const satisfies readonly { value: Level; label: string }[];

export const LEVEL_HINTS: Record<Level, string> = {
  B1: 'Mostra mais palavras, inclusive as mais simples',
  B2: 'Pula o básico, foca no intermediário',
  C1: 'Só expressões e palavras menos comuns',
};

const CORNER_NAMES: Record<Corner, string> = {
  tl: 'Canto superior esquerdo',
  tr: 'Canto superior direito',
  bl: 'Canto inferior esquerdo',
  br: 'Canto inferior direito',
};
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

const CARDS_AT_ONCE = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
] as const;

const KEY_STATUS_TEXT = {
  missing: '',
  untested: 'Testando…',
  ok: '✓ Funcionando',
  invalid: 'Não funcionou',
} as const;

function CornerPicker({ value, onChange }: { value: Corner; onChange?: (corner: Corner) => void }) {
  return (
    <div className="box-border grid h-[66px] w-28 grid-cols-2 grid-rows-2 gap-1 rounded-lg border border-white/14 bg-white/6 p-[5px]">
      {CORNERS.map((corner) => (
        <button
          key={corner}
          aria-label={CORNER_NAMES[corner]}
          aria-pressed={corner === value}
          onClick={() => onChange?.(corner)}
          className="flex rounded-[4px]"
          style={{
            justifyContent: corner[1] === 'l' ? 'flex-start' : 'flex-end',
            alignItems: corner[0] === 't' ? 'flex-start' : 'flex-end',
          }}
        >
          <span
            className={`h-[11px] w-[18px] rounded-[3px] ${corner === value ? 'bg-white' : 'bg-white/18'}`}
          />
        </button>
      ))}
    </div>
  );
}

export function KeyRow({
  provider,
  view,
  onSaveKey,
}: {
  provider: Provider;
  view: View;
  onSaveKey?: (key: string) => void;
}) {
  const info = view.keys[provider];
  return (
    <Row label="Chave da API">
      <div className="flex items-center gap-2.5">
        <KeyField key={provider} mask={info.mask} onSave={onSaveKey} />
        <span className="text-[12px] whitespace-nowrap text-white/55">
          {KEY_STATUS_TEXT[info.status]}
        </span>
      </div>
    </Row>
  );
}

/** Código que a pessoa cola na extensão. Não tem frame no mockup: segue o estilo das outras linhas. */
export function PairingRow({ view }: { view: View }) {
  const [copied, setCopied] = useState(false);
  const { token, connected } = view.pairing;
  const copy = () => {
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Row label="Extensão">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 min-w-0 flex-1 items-center rounded-[7px] border border-white/12 bg-white/6 px-2.5 font-mono text-[12px] text-white/80">
          <span className="truncate">{`${token.slice(0, 8)}••••••••`}</span>
        </span>
        <button
          onClick={copy}
          className="flex h-[26px] items-center rounded-lg bg-white/10 px-2.5 text-[12px] font-medium hover:bg-white/18"
        >
          {copied ? 'Copiado ✓' : 'Copiar'}
        </button>
        <span className="text-[12px] whitespace-nowrap text-white/55">
          {connected ? '✓ Conectada' : 'Não conectada'}
        </span>
      </div>
    </Row>
  );
}

export interface SettingsViewProps {
  view: View;
  /** Só as linhas que o frame 1e desenha, para a comparação com o mockup. */
  mockupOnly?: boolean;
  onChange?: (patch: Partial<Settings>) => void;
  onSaveKey?: (provider: Provider, key: string) => void;
}

/** Janela de configurações: frame 1e. */
export function SettingsView({ view, mockupOnly = false, onChange, onSaveKey }: SettingsViewProps) {
  const { settings } = view;
  return (
    <div className="bg-surface text-[13px] text-white">
      <div className="drag relative flex h-[38px] items-center border-b border-white/6 px-3.5">
        <TrafficLights />
        <span className="pointer-events-none absolute inset-x-0 text-center font-semibold text-white/85">
          Configurações
        </span>
      </div>
      <div className="flex flex-col gap-[18px] px-[26px] pt-[22px] pb-[26px]">
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
        {!mockupOnly && (
          <Row label="Todas as palavras">
            <div className="flex items-center gap-2.5">
              <Toggle
                on={settings.translateAllWords}
                label="Traduzir todas as palavras"
                onChange={(translateAllWords) => onChange?.({ translateAllWords })}
              />
              <span className="text-[12px] text-white/55">
                Ignora o nível. As palavras repetidas só aparecem em resumo, sem nova tradução
              </span>
            </div>
          </Row>
        )}
        <Row label="Cards por minuto">
          <StepSlider
            label="Cards por minuto"
            stops={CARD_STOPS}
            value={settings.cardsPerMinute}
            onChange={(cardsPerMinute) => onChange?.({ cardsPerMinute })}
          />
        </Row>
        {!mockupOnly && (
          <Row label="Tempo de cada card">
            <StepSlider
              label="Tempo de cada card"
              stops={CARD_TIME_STOPS}
              value={settings.cardSeconds}
              format={(seconds) => `${seconds} s`}
              onChange={(cardSeconds) => onChange?.({ cardSeconds })}
            />
          </Row>
        )}
        {!mockupOnly && (
          <Row label="Cards por vez">
            <Segmented
              options={CARDS_AT_ONCE}
              value={String(settings.cardsAtOnce) as '1' | '2' | '3'}
              itemClass="w-11"
              onChange={(value) => onChange?.({ cardsAtOnce: Number(value) })}
            />
          </Row>
        )}
        {!mockupOnly && (
          <Row label="Resumos na tela">
            <StepSlider
              label="Resumos na tela"
              stops={SUMMARY_STOPS}
              value={settings.maxSummaries}
              onChange={(maxSummaries) => onChange?.({ maxSummaries })}
            />
          </Row>
        )}
        <Row label="Posição dos cards" top>
          <div className="flex items-center gap-3.5">
            <CornerPicker value={settings.corner} onChange={(corner) => onChange?.({ corner })} />
            <span className="text-[12px] text-white/55">{CORNER_NAMES[settings.corner]}</span>
          </div>
        </Row>
        <Row label="Destacar na legenda">
          <div className="flex items-center gap-2.5">
            <Toggle
              on={settings.highlightSubtitles}
              label="Destacar na legenda"
              onChange={(highlightSubtitles) => onChange?.({ highlightSubtitles })}
            />
            <span className="text-[12px] text-white/55">
              Sublinha as palavras novas na legenda da Netflix e do YouTube
            </span>
          </div>
        </Row>
        {!mockupOnly && (
          <Row label="Ao buscar (⌘⇧B)">
            <div className="flex items-center gap-2.5">
              <Toggle
                on={settings.rewindOnSearch}
                label="Voltar o vídeo ao buscar"
                onChange={(rewindOnSearch) => onChange?.({ rewindOnSearch })}
              />
              <span className="text-[12px] text-white/55">
                Volta o vídeo 10 s para você ouvir a palavra de novo
              </span>
            </div>
          </Row>
        )}
        {!mockupOnly && <PairingRow view={view} />}
      </div>
    </div>
  );
}
