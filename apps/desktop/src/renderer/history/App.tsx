import type { HistoryFilter, HistoryList, HistoryScope, HistoryWords } from '@legendary/contracts';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../shared/api';
import { HistoryView } from './HistoryView';

const PAGE_SIZE = 500;
const EMPTY_LIST: HistoryList = { sessions: [], counts: { all: 0, saved: 0, dueToday: 0 } };

export function App() {
  const [list, setList] = useState<HistoryList>(EMPTY_LIST);
  const [now, setNow] = useState(0);
  const [scope, setScope] = useState<HistoryScope | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [words, setWords] = useState<HistoryWords>({ rows: [], total: 0 });

  const apply = useCallback((next: HistoryList) => {
    setList(next);
    setNow(Date.now());
    // Abre na sessão mais recente, como no frame 1j.
    setScope((current) => {
      if (current) return current;
      const latest = next.sessions[0];
      return latest ? { kind: 'session', sessionId: latest.id } : { kind: 'all' };
    });
  }, []);

  useEffect(() => {
    const load = () => void api().invoke('history:list').then(apply);
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [apply]);

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    void api()
      .invoke('history:words', { scope, filter, search, limit: PAGE_SIZE, offset: 0 })
      .then((next) => {
        if (!cancelled) setWords(next);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, filter, search, list]);

  if (!scope) return <div className="h-full bg-surface" />;

  return (
    <HistoryView
      list={list}
      scope={scope}
      filter={filter}
      search={search}
      words={words.rows}
      total={words.total}
      now={now}
      onScope={setScope}
      onFilter={setFilter}
      onSearch={setSearch}
      onRetake={(sessionId) => void api().invoke('quiz:open', { sessionId })}
    />
  );
}
