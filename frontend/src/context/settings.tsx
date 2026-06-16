/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { settingsService } from '@/services/api/setup';
import type { Settings } from '@/types';

interface SettingsValue {
  companyName: string | null;
  settings: Settings | null;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSettings(await settingsService.get());
    } catch {
      // ajustes no disponibles aún (p. ej. antes del onboarding)
    }
  }, []);

  useEffect(() => {
    settingsService
      .get()
      .then(setSettings)
      .catch(() => {
        // ignorar
      });
  }, []);

  return (
    <SettingsContext.Provider value={{ companyName: settings?.company_name ?? null, settings, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de SettingsProvider');
  return ctx;
};
