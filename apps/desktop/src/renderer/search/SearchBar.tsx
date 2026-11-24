import type { Ref } from 'react';
import { Glass } from '../shared/Glass';

const GLASS =
  'box-border w-full rounded-[14px] shadow-[0_10px_30px_rgba(0,0,0,0.28)] [--glass-bg:rgba(28,28,32,0.88)]';
const LIST_ID = 'search-suggestions';

const optionId = (index: number) => `${LIST_ID}-${index}`;

export interface SearchBarProps {
  value: string;
  idle?: boolean;
  suggestions?: readonly string[];
  selected?: number | null;
  inputRef?: Ref<HTMLInputElement>;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
  onMove?: (step: 1 | -1) => void;
  onPick?: (word: string) => void;
}

export function SearchBar({
  value,
  idle,
  suggestions = [],
  selected = null,
  inputRef,
  onChange,
  onSubmit,
  onCancel,
  onMove,
  onPick,
}: SearchBarProps) {
  const open = suggestions.length > 0;
  const typed = value.replace(/\s+/g, ' ').trimStart().length;

  return (
    <div className="flex flex-col gap-1.5">
      <Glass className={`${GLASS} flex h-11 items-center px-4`}>
        <input
          ref={inputRef}
          autoFocus
          role="combobox"
          aria-label="Buscar palavra"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={LIST_ID}
          aria-activedescendant={open && selected !== null ? optionId(selected) : undefined}
          placeholder={idle ? 'Inicie uma sessão para buscar (⌘⇧L)' : 'Buscar palavra em inglês'}
          maxLength={60}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSubmit?.();
            if (event.key === 'Escape') onCancel?.();
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              onMove?.(event.key === 'ArrowDown' ? 1 : -1);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-white outline-none placeholder:font-normal placeholder:text-white/40"
        />
      </Glass>
      {open && (
        <Glass
          id={LIST_ID}
          role="listbox"
          aria-label="Palavras da legenda"
          className={`${GLASS} flex flex-col p-1.5 text-[15px] font-medium text-white`}
        >
          {suggestions.map((word, index) => (
            <div
              key={word}
              id={optionId(index)}
              role="option"
              aria-selected={index === selected}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onPick?.(word)}
              className={`flex h-[34px] cursor-default items-center rounded-[9px] px-2.5 ${
                index === selected ? 'bg-white/10' : ''
              }`}
            >
              {word.slice(0, typed)}
              <span className="text-white/55">{word.slice(typed)}</span>
            </div>
          ))}
        </Glass>
      )}
    </div>
  );
}
