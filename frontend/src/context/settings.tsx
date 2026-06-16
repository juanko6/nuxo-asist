/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { settingsService } from '@/services/api/setup';

interface SettingsValue {
  companyName: string | null;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companyName, setCompanyName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await settingsService.get();
      setCompanyName(s.company_name);
    } catch {
      // ajustes no disponibles aún (p. ej. antes del onboarding)
    }
  }, []);

  useEffect(() => {
    settingsService
      .get()
      .then((s) => setCompanyName(s.company_name))
      .catch(() => {
        // ajustes no disponibles aún (p. ej. antes del onboarding)
      });
  }, []);

  return (
    <SettingsContext.Provider value={{ companyName, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsValue => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de SettingsProvider');
  return ctx;
};
