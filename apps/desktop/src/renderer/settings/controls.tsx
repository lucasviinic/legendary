import { useState, type ReactNode } from 'react';

export function Row({
  label,
  top,
  children,
}: {
  label: string;
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid grid-cols-[150px_minmax(0,1fr)] gap-3.5 ${top ? 'items-start' : 'items-center'}`}
    >
      <span className={`text-right text-white/70 ${top ? 'pt-1' : ''}`}>{label}</span>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  itemClass = 'px-3.5',
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange?: (value: T) => void;
  itemClass?: string;
}) {
  return (
    <div className="flex w-max gap-0.5 rounded-lg bg-white/8 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange?.(option.value)}
          className={`flex h-6 items-center justify-center rounded-md font-medium ${itemClass} ${
            option.value === value ? 'bg-white/90 text-ink' : 'text-white/80'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const FIELD =
  'flex h-7 flex-1 items-center rounded-[7px] border border-white/12 bg-white/6 px-2.5 font-mono text-[12px] text-white/80';

/** Campo da API key. A chave vai direto para o main e aqui só volta a máscara. */
export function KeyField({
  mask,
  onSave,
}: {
  mask: string | null;
  onSave?: (key: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const finish = () => {
    if (draft.trim()) onSave?.(draft.trim());
    setDraft('');
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="password"
        aria-label="Chave da API"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Enter') finish();
          if (event.key === 'Escape') {
            setDraft('');
            setEditing(false);
          }
        }}
        placeholder="Cole sua chave aqui"
        className={`${FIELD} min-w-0 outline-none placeholder:text-white/35`}
      />
    );
  }
  return (
    <button
      aria-label="Editar chave da API"
      onClick={() => setEditing(true)}
      className={`${FIELD} min-w-0 text-left`}
    >
      <span className="truncate">
        {mask ?? <span className="text-white/35">Cole sua chave aqui</span>}
      </span>
    </button>
  );
}

export interface SliderStop {
  value: number;
  /** Posição na faixa, em porcentagem. */
  at: number;
}

/** O frame 1e desenha "até 2" em 33%. Os outros passos dividem o resto da faixa, até um card a cada 6 s. */
export const CARD_STOPS: SliderStop[] = [
  { value: 1, at: 0 },
  { value: 2, at: 33 },
  { value: 4, at: 50 },
  { value: 6, at: 67 },
  { value: 8, at: 83 },
  { value: 10, at: 100 },
];

const evenStops = (values: number[]): SliderStop[] =>
  values.map((value, index) => ({
    value,
    at: Math.round((index / (values.length - 1)) * 100),
  }));

export const SUMMARY_STOPS = evenStops([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
/** Inclui 6 s, o tempo que deixa os 10 cards por minuto caberem com um card por vez. */
export const CARD_TIME_STOPS = evenStops([3, 4, 5, 6, 8, 10, 15, 20, 30]);

const upTo = (value: number) => `até ${value}`;

const ARROW_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
};

/** Controle deslizante do frame 1e, sobre um input nativo para manter o teclado funcionando. */
export function StepSlider({
  label,
  stops,
  value,
  format = upTo,
  onChange,
}: {
  label: string;
  stops: SliderStop[];
  value: number;
  format?: (value: number) => string;
  onChange?: (value: number) => void;
}) {
  // Um valor salvo fora dos passos, como 3, aparece no passo seguinte até ser alterado.
  const index = stops.findIndex((stop) => stop.value >= value);
  const { at } = stops[index]!;
  const nearest = (position: number) =>
    stops.reduce((best, stop) =>
      Math.abs(stop.at - position) < Math.abs(best.at - position) ? stop : best,
    );
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-1 w-[200px] rounded-sm bg-white/15">
        <div
          className="absolute inset-y-0 left-0 rounded-sm bg-white/75"
          style={{ width: `${at}%` }}
        />
        <div
          className="absolute top-1/2 -mt-2 -ml-2 size-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
          style={{ left: `${at}%` }}
        />
        <input
          type="range"
          aria-label={label}
          aria-valuetext={format(value)}
          min={0}
          max={100}
          value={at}
          onChange={(event) => onChange?.(nearest(Number(event.target.value)).value)}
          onKeyDown={(event) => {
            // A seta nativa anda 1% e o controle voltaria para o mesmo passo.
            const step = ARROW_STEP[event.key];
            if (!step) return;
            event.preventDefault();
            const next = stops[index + step];
            if (next) onChange?.(next.value);
          }}
          className="absolute -inset-x-2 -top-2 m-0 box-border h-5 w-[216px] opacity-0"
        />
      </div>
      <span className="tabular-nums">{format(value)}</span>
    </div>
  );
}

export function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange?: (on: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange?.(!on)}
      className={`relative h-[19px] w-8 rounded-[10px] transition-colors duration-200 ${on ? 'bg-ok' : 'bg-white/20'}`}
    >
      <span
        className="absolute top-0.5 size-[15px] rounded-full bg-white transition-[left] duration-200"
        style={{ left: on ? 15 : 2 }}
      />
    </button>
  );
}
