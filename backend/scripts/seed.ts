import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

// Datos iniciales de desarrollo. Idempotente: no duplica usuarios existentes.
// En producción cambia las credenciales del admin vía SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL no está definida');
  process.exit(1);
}

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@empresa.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'cambiar-admin-123';

const users = [
  {
    email: adminEmail,
    name: 'Admin Sistema',
    password: adminPassword,
    role: 'admin',
    department: 'Administración',
    position: 'Gerente',
  },
  {
    email: 'juan@empresa.com',
    name: 'Juan Pérez',
    password: 'empleado-1234',
    role: 'employee',
    department: 'Ventas',
    position: 'Ejecutivo',
  },
  {
    email: 'maria@empresa.com',
    name: 'María González',
    password: 'empleado-1234',
    role: 'employee',
    department: 'Marketing',
    position: 'Diseñadora',
  },
  {
    email: 'carlos@empresa.com',
    name: 'Carlos Ruiz',
    password: 'empleado-1234',
    role: 'employee',
    department: 'IT',
    position: 'Desarrollador',
  },
];

const pool = createPool(databaseUrl);
try {
  await runMigrations(pool);
  for (const user of users) {
    const { rows } = await pool.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [
      user.email,
    ]);
    if (rows.length > 0) {
      console.log(`= ${user.email} ya existe, no se toca`);
      continue;
    }
    const hash = await bcrypt.hash(user.password, 10);
    await pool.query(
      `INSERT INTO users (email, name, password_hash, role, department, position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.email, user.name, hash, user.role, user.department, user.position]
    );
    console.log(`+ ${user.email} creado (${user.role})`);
  }
  // Nombre de empresa por defecto (en producción se fija en el onboarding inicial)
  await pool.query(
    `INSERT INTO app_settings (id, company_name) VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [process.env.SEED_COMPANY_NAME ?? 'Empresa Demo']
  );
  console.log('Seed completado.');
} finally {
  await pool.end();
}
