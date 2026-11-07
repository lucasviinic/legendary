import { useEffect, useRef, useState } from 'react';
import { api } from '../shared/api';
import { SearchBar } from './SearchBar';

/** A janela fica escondida em memória: cada abertura começa com o campo vazio e pronto para digitar. */
export function App() {
  const [query, setQuery] = useState('');
  const [idle, setIdle] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api()
      .invoke('session:get-status')
      .then((status) => setIdle(status.state === 'idle'));
    return api().on('session:status', (status) => setIdle(status.state === 'idle'));
  }, []);

  useEffect(() => {
    const onFocus = () => input.current?.focus();
    const onBlur = () => setQuery('');
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const close = () => {
    setQuery('');
    void api().invoke('search:hide');
  };
  const submit = () => {
    const word = query.trim();
    if (idle || !word) return close();
    setQuery('');
    void api().invoke('search:submit', { query: word });
  };

  return (
    <div className="box-border h-full px-5 pt-2">
      <SearchBar
        value={idle ? '' : query}
        idle={idle}
        inputRef={input}
        onChange={setQuery}
        onSubmit={submit}
        onCancel={close}
      />
    </div>
  );
}
