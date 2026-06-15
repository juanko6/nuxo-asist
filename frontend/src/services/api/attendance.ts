import { api } from './client';
import type {
  AttendanceRecord,
  AttendanceDetail,
  AttendancePause,
  AttendanceCorrection,
  ManualEntryDTO,
  ValidateAttendanceDTO,
} from '@/types';

export interface AttendanceFilters {
  date?: string;
  employee_id?: string;
}

export interface ExportRange {
  from?: string;
  to?: string;
}

export const attendanceService = {
  getAll: (filters: AttendanceFilters = {}): Promise<AttendanceRecord[]> => {
    const params = new URLSearchParams();
    if (filters.date) params.set('date', filters.date);
    if (filters.employee_id) params.set('employee_id', filters.employee_id);
    const query = params.toString();
    return api.get<AttendanceRecord[]>(`/attendance${query ? `?${query}` : ''}`);
  },

  getById: (id: string): Promise<AttendanceDetail> =>
    api.get<AttendanceDetail>(`/attendance/${id}`),

  checkIn: (): Promise<AttendanceRecord> =>
    api.post<AttendanceRecord>('/attendance/check-in'),

  checkOut: (): Promise<AttendanceRecord> =>
    api.post<AttendanceRecord>('/attendance/check-out'),

  // HU-02: registro olvidado (entrada manual) y validación
  createManualEntry: (data: ManualEntryDTO): Promise<AttendanceRecord> =>
    api.post<AttendanceRecord>('/attendance/manual', data),

  validate: (id: string, data: ValidateAttendanceDTO): Promise<AttendanceRecord> =>
    api.post<AttendanceRecord>(`/attendance/${id}/validate`, data),

  // HU-04: pausas intrajornada
  startPause: (reason?: string): Promise<AttendancePause> =>
    api.post<AttendancePause>('/attendance/pause/start', reason ? { reason } : undefined),

  endPause: (): Promise<AttendancePause> =>
    api.post<AttendancePause>('/attendance/pause/end'),

  // HU-04: corrección con traza (solo admin)
  correct: (id: string, data: AttendanceCorrection): Promise<AttendanceRecord> =>
    api.patch<AttendanceRecord>(`/attendance/${id}`, data),

  // HU-04: export CSV para inspección (solo admin)
  exportCsv: (range: ExportRange = {}): Promise<Blob> => {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    const query = params.toString();
    return api.getBlob(`/attendance/export.csv${query ? `?${query}` : ''}`);
  },

  requestOvertime: (id: string): Promise<AttendanceRecord> =>
    api.post<AttendanceRecord>(`/attendance/${id}/overtime/request`),

  approveOvertime: (id: string): Promise<AttendanceRecord> =>
    api.post<AttendanceRecord>(`/attendance/${id}/overtime/approve`),
};
