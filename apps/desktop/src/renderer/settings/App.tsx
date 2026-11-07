import type { Provider, Settings, SettingsView as View } from '@legendary/contracts';
import { useEffect, useState } from 'react';
import { api } from '../shared/api';
import { useFitWindow } from '../shared/useFitWindow';
import { OnboardingView } from './OnboardingView';
import { SettingsView } from './SettingsView';

const isOnboarding = new URLSearchParams(location.search).get('mode') === 'onboarding';

export function App() {
  const [view, setView] = useState<View | null>(null);
  const root = useFitWindow<HTMLDivElement>();

  useEffect(() => {
    void api().invoke('settings:get').then(setView);
    return api().on('settings:changed', setView);
  }, []);

  const change = (patch: Partial<Settings>) =>
    void api().invoke('settings:set', patch).then(setView);
  const saveKey = (provider: Provider, key: string) =>
    void api().invoke('settings:set-api-key', { provider, key }).then(setView);
  const finish = async () => {
    await api().invoke('settings:set', { onboarded: true });
    await api().invoke('window:close-current');
  };

  return (
    <div ref={root}>
      {view &&
        (isOnboarding ? (
          <OnboardingView
            view={view}
            onChange={change}
            onSaveKey={saveKey}
            onFinish={() => void finish()}
          />
        ) : (
          <SettingsView view={view} onChange={change} onSaveKey={saveKey} />
        ))}
    </div>
  );
}
