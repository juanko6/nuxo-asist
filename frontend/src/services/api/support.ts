import { api } from './client';
import type { SupportTicketDTO } from '@/types';

export const supportService = {
  create: (data: SupportTicketDTO): Promise<{ email_sent: boolean }> =>
    api.post<{ email_sent: boolean }>('/support', data),
};
