import { api } from './client';
import type { Absence, CreateAbsenceDTO } from '@/types';

export const absencesService = {
  getAll: (employeeId?: string): Promise<Absence[]> => {
    const query = employeeId ? `?employee_id=${employeeId}` : '';
    return api.get<Absence[]>(`/absences${query}`);
  },

  create: (data: CreateAbsenceDTO): Promise<Absence> => api.post<Absence>('/absences', data),

  delete: (id: string): Promise<void> => api.delete<void>(`/absences/${id}`),
};
