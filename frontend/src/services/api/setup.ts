import { api } from './client';
import type { SetupStatus, SetupDTO, Settings, SettingsUpdate } from '@/types';

export const setupService = {
  status: (): Promise<SetupStatus> => api.get<SetupStatus>('/setup/status'),
  complete: (data: SetupDTO): Promise<{ company_name: string }> =>
    api.post<{ company_name: string }>('/setup', data),
};

export const settingsService = {
  get: (): Promise<Settings> => api.get<Settings>('/settings'),
  update: (patch: SettingsUpdate): Promise<Settings> => api.put<Settings>('/settings', patch),
};
