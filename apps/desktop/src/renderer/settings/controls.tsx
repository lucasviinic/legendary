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

const SLIDER_MIN = 1;
const SLIDER_MAX = 4;

/** Controle deslizante do frame 1e, sobre um input nativo para manter o teclado funcionando. */
export function CardsSlider({
  value,
  onChange,
}: {
  value: number;
  onChange?: (value: number) => void;
}) {
  const percent = `${Math.round(((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100)}%`;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-1 w-[200px] rounded-sm bg-white/15">
        <div
          className="absolute inset-y-0 left-0 rounded-sm bg-white/75"
          style={{ width: percent }}
        />
        <div
          className="absolute top-1/2 -mt-2 -ml-2 size-4 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
          style={{ left: percent }}
        />
        <input
          type="range"
          aria-label="Cards por minuto"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          value={value}
          onChange={(event) => onChange?.(Number(event.target.value))}
          className="absolute -inset-x-2 -top-2 m-0 box-border h-5 w-[216px] opacity-0"
        />
      </div>
      <span className="tabular-nums">até {value}</span>
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
