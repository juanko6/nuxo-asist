import { api } from './client';
import type { LoginLog } from '@/types';

export const loginLogsService = {
  getAll: (date?: string): Promise<LoginLog[]> =>
    api.get<LoginLog[]>(`/login-logs${date ? `?date=${date}` : ''}`),
};
