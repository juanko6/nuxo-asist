// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'employee' | 'admin';
  department: string;
  position: string;
  created_at?: string;
}

export interface CreateUserDTO {
  name: string;
  email: string;
  password: string;
  department: string;
  position: string;
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  password?: string;
  department?: string;
  position?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// Attendance Types
export type AttendanceSource = 'realtime' | 'manual' | 'system';
export type AttendanceStatus = 'confirmed' | 'pending_validation' | 'rejected';

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  check_in: string;
  check_out: string | null;
  overtime_requested: boolean;
  overtime_approved: boolean;
  source: AttendanceSource;
  status: AttendanceStatus;
  created_at?: string;
}

// HU-02: registro olvidado (entrada manual)
export interface ManualEntryDTO {
  check_in: string;
  check_out?: string;
  reason?: string;
}

export interface ValidateAttendanceDTO {
  decision: 'approve' | 'reject';
  reason?: string;
}

// HU-04: pausas intrajornada
export interface AttendancePause {
  id: string;
  attendance_id: string;
  pause_start: string;
  pause_end: string | null;
  reason: string | null;
  created_at: string;
}

// HU-04: huella de auditoría de correcciones (append-only)
export interface AttendanceAuditEntry {
  id: string;
  attendance_id: string | null;
  actor_id: string | null;
  actor_name: string;
  action: 'correction' | 'manual_create' | 'system_close';
  reason: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  created_at: string;
}

// HU-04: detalle de un registro con pausas y auditoría
export interface AttendanceDetail extends AttendanceRecord {
  pauses: AttendancePause[];
  pause_minutes: number;
  worked_minutes: number | null;
  audit: AttendanceAuditEntry[];
}

export interface AttendanceCorrection {
  check_in?: string;
  check_out?: string | null;
  reason: string;
}

// HU-05: horarios y cargas horarias
export interface ScheduleTemplateDay {
  weekday: number; // ISO: 1=lunes … 7=domingo
  start_time: string;
  end_time: string;
}

export interface ScheduleTemplateSummary {
  id: string;
  name: string;
  description: string | null;
  weekly_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface ScheduleTemplateDetail extends ScheduleTemplateSummary {
  days: ScheduleTemplateDay[];
}

export interface CreateScheduleTemplateDTO {
  name: string;
  description?: string;
  days: ScheduleTemplateDay[];
}

export interface EmployeeSchedule {
  id: string;
  employee_id: string;
  template_id: string;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
}

export interface EmployeeScheduleActive extends EmployeeSchedule {
  template_name: string;
  weekly_minutes: number;
  days: ScheduleTemplateDay[];
}

export interface EmployeeScheduleView {
  active: EmployeeScheduleActive | null;
  history: (EmployeeSchedule & { template_name?: string })[];
}

export interface AssignScheduleDTO {
  template_id: string;
  valid_from: string;
}

// Onboarding / ajustes de la instancia
export interface SetupStatus {
  needs_setup: boolean;
  company_name: string | null;
}

export interface SetupDTO {
  company_name: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
}

export interface Settings {
  company_name: string | null;
}

// HU-01: ausencias
export type AbsenceType = 'vacation' | 'sick_leave' | 'leave' | 'other';

export interface Absence {
  id: string;
  employee_id: string;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateAbsenceDTO {
  employee_id: string;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  reason?: string;
}

// Notification Types
export interface Notification {
  id: string;
  employee_id: string;
  employee_name: string;
  attendance_id: string | null;
  message: string;
  type: 'overtime_request' | 'approval' | 'info' | 'absence';
  read: boolean;
  timestamp: string;
}

// LoginLog Types
export interface LoginLog {
  id: string;
  employee_id: string;
  employee_name: string;
  login_time: string;
}

// Alert Types
export type AlertType = 'success' | 'error' | 'info' | 'warning';

export interface AlertMessage {
  type: AlertType;
  message: string;
}

// Component Props Types
export interface EmployeeProfileProps {
  user: User;
}

export interface AttendanceControlsProps {
  user: User;
  attendance: AttendanceRecord[];
  onCheckIn: () => void;
  onCheckOut: () => void;
  onRequestOvertime: () => void;
}

export interface LoginFormProps {
  onLogin: (credentials: LoginCredentials) => Promise<boolean>;
}

export interface AlertProps {
  alert: AlertMessage | null;
  onClose: () => void;
}

export interface CreateEmployeeModalProps {
  onClose: () => void;
  onCreateEmployee: (data: CreateUserDTO) => void;
}

export interface EmployeeListProps {
  employees: User[];
}

export interface DailyAttendanceHistoryProps {
  attendance: AttendanceRecord[];
  employees: User[];
  loginLogs: LoginLog[];
}

export interface AdminDashboardProps {
  attendance: AttendanceRecord[];
  notifications: Notification[];
  loginLogs: LoginLog[];
  employees: User[];
  onApproveOvertime: (notification: Notification) => void;
  onLogout: () => void;
  onCreateEmployee: (data: CreateUserDTO) => void;
}

export interface AttendanceHistoryProps {
  userId: string;
  attendance: AttendanceRecord[];
}
