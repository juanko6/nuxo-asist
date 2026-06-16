import { api } from './client';
import type {
  User, UserStatus, CreateUserDTO, UpdateUserDTO, BulkEmployeeRow, BulkImportResult,
} from '@/types';

export const employeesService = {
  getAll: (status?: UserStatus | 'all'): Promise<User[]> =>
    api.get<User[]>(`/employees${status ? `?status=${status}` : ''}`),

  getById: (id: string): Promise<User> => api.get<User>(`/employees/${id}`),

  create: (employee: CreateUserDTO): Promise<User> =>
    api.post<User>('/employees', employee),

  update: (id: string, updates: UpdateUserDTO): Promise<User> =>
    api.patch<User>(`/employees/${id}`, updates),

  archive: (id: string): Promise<User> => api.post<User>(`/employees/${id}/archive`),

  restore: (id: string): Promise<User> => api.post<User>(`/employees/${id}/restore`),

  bulkCreate: (employees: BulkEmployeeRow[]): Promise<BulkImportResult> =>
    api.post<BulkImportResult>('/employees/bulk', { employees }),
};
