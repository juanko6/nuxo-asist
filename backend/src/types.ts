import type { Pool } from 'pg';
import type { AppConfig } from './config.js';

export type Role = 'employee' | 'admin';

/** Usuario sin credenciales: lo único que sale del backend. */
export type UserStatus = 'active' | 'inactive';

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string;
  position: string;
  status: UserStatus;
  archived_at: Date | null;
  must_change_password: boolean;
  created_at: Date;
}

export type AttendanceSource = 'realtime' | 'manual' | 'system';
export type AttendanceStatus = 'confirmed' | 'pending_validation' | 'rejected';

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  check_in: Date;
  check_out: Date | null;
  overtime_requested: boolean;
  overtime_approved: boolean;
  source: AttendanceSource;
  status: AttendanceStatus;
  created_at: Date;
}

export interface AttendancePause {
  id: string;
  attendance_id: string;
  pause_start: Date;
  pause_end: Date | null;
  reason: string | null;
  created_at: Date;
}

export interface AttendanceAuditEntry {
  id: string;
  attendance_id: string | null;
  actor_id: string | null;
  actor_name: string;
  action: 'correction' | 'manual_create' | 'system_close' | 'manual_validate';
  reason: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  created_at: Date;
}

/** Bloque de trabajo en un día. weekday ISO: 1=lunes … 7=domingo. */
export interface ScheduleTemplateDay {
  id: string;
  template_id: string;
  weekday: number;
  start_time: string; // 'HH:MM:SS'
  end_time: string;
  created_at: Date;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface EmployeeSchedule {
  id: string;
  employee_id: string;
  template_id: string;
  valid_from: string; // 'YYYY-MM-DD'
  valid_to: string | null;
  created_at: Date;
}

export interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  created_by: string | null;
  created_by_name: string;
  created_by_email: string;
  company_name: string | null;
  status: 'open' | 'closed';
  created_at: Date;
}

export type AbsenceType = 'vacation' | 'sick_leave' | 'leave' | 'other';

export interface Absence {
  id: string;
  employee_id: string;
  type: AbsenceType;
  start_date: string; // 'YYYY-MM-DD'
  end_date: string;
  reason: string | null;
  created_by: string | null;
  created_at: Date;
}

declare module 'fastify' {
  interface FastifyInstance {
    pg: Pool;
    config: AppConfig;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    currentUser: SafeUser;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
    user: { sub: string; role: Role };
  }
}
