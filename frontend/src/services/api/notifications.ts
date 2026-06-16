import { api } from './client';
import type { Notification } from '@/types';

export const notificationsService = {
  getAll: (): Promise<Notification[]> => api.get<Notification[]>('/notifications'),

  delete: (id: string): Promise<void> => api.delete<void>(`/notifications/${id}`),
};
