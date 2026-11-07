import type { Ref } from 'react';
import { Glass } from '../shared/Glass';

export interface SearchBarProps {
  value: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  onCancel?: () => void;
}

/**
 * Não tem frame no mockup. Usa o vidro dos cards (frame 1a), mais opaco porque o texto digitado não
 * pode sumir em uma cena clara, e a cor do texto de exemplo do campo de busca do histórico (1f).
 */
export function SearchBar({ value, inputRef, onChange, onSubmit, onCancel }: SearchBarProps) {
  return (
    <Glass className="box-border flex h-11 w-full items-center rounded-[14px] px-4 shadow-[0_10px_30px_rgba(0,0,0,0.28)] [--glass-bg:rgba(28,28,32,0.88)]">
      <input
        ref={inputRef}
        autoFocus
        aria-label="Buscar palavra"
        placeholder="Buscar palavra em inglês"
        maxLength={60}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.();
          if (event.key === 'Escape') onCancel?.();
        }}
        className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-white outline-none placeholder:font-normal placeholder:text-white/40"
      />
    </Glass>
  );
}
