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
export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  check_in: string;
  check_out: string | null;
  overtime_requested: boolean;
  overtime_approved: boolean;
  created_at?: string;
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

// Notification Types
export interface Notification {
  id: string;
  employee_id: string;
  employee_name: string;
  attendance_id: string | null;
  message: string;
  type: 'overtime_request' | 'approval' | 'info';
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
