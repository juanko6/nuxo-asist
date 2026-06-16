import type { Pool, PoolClient } from 'pg';

export type AuditAction =
  | 'correction'
  | 'manual_create'
  | 'system_close'
  | 'manual_validate';

export interface AuditInput {
  attendanceId: string;
  actorId: string | null;
  actorName: string;
  action: AuditAction;
  reason: string;
  changes: Record<string, { old: unknown; new: unknown }>;
}

/**
 * Registra una entrada en la auditoría append-only de asistencia.
 * Acepta un pool o un client (para escribir dentro de una transacción junto
 * con la modificación que se está auditando).
 */
export async function recordAudit(
  db: Pool | PoolClient,
  input: AuditInput
): Promise<void> {
  await db.query(
    `INSERT INTO attendance_audit
       (attendance_id, actor_id, actor_name, action, reason, changes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.attendanceId,
      input.actorId,
      input.actorName,
      input.action,
      input.reason,
      JSON.stringify(input.changes),
    ]
  );
}
