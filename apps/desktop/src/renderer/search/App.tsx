import { useEffect, useRef, useState } from 'react';
import { api } from '../shared/api';
import { useFitWindow } from '../shared/useFitWindow';
import { SearchBar } from './SearchBar';

export function App() {
  const [query, setQuery] = useState('');
  const [idle, setIdle] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const asked = useRef(0);
  const root = useFitWindow<HTMLDivElement>();

  const reset = () => {
    asked.current += 1;
    setQuery('');
    setSuggestions([]);
    setSelected(null);
  };

  useEffect(() => {
    void api()
      .invoke('session:get-status')
      .then((status) => setIdle(status.state === 'idle'));
    return api().on('session:status', (status) => setIdle(status.state === 'idle'));
  }, []);

  useEffect(() => {
    const onFocus = () => input.current?.focus();
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', reset);
    };
  }, []);

  const change = (value: string) => {
    setQuery(value);
    setSelected(null);
    const ask = ++asked.current;
    if (idle || !value.trim()) {
      setSuggestions([]);
      return;
    }
    void api()
      .invoke('search:suggest', { query: value })
      .then(({ words }) => {
        if (ask === asked.current) setSuggestions(words);
      });
  };

  const move = (step: 1 | -1) => {
    if (suggestions.length === 0) return;
    setSelected((current) => {
      if (current === null) return step === 1 ? 0 : null;
      const next = current + step;
      if (next < 0) return null;
      return Math.min(next, suggestions.length - 1);
    });
  };

  const close = () => {
    reset();
    void api().invoke('search:hide');
  };
  const search = (text: string) => {
    const word = text.trim();
    if (idle || !word) return close();
    reset();
    void api().invoke('search:submit', { query: word });
  };

  return (
    <div ref={root} className="box-border px-5 pb-10 pt-2">
      <SearchBar
        value={idle ? '' : query}
        idle={idle}
        suggestions={suggestions}
        selected={selected}
        inputRef={input}
        onChange={change}
        onSubmit={() => search(selected === null ? query : (suggestions[selected] ?? query))}
        onCancel={close}
        onMove={move}
        onPick={search}
      />
    </div>
  );
}
