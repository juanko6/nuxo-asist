import pg from 'pg';

// Devuelve las columnas DATE (OID 1082) como string 'YYYY-MM-DD' en vez de Date.
// Las vigencias de horario (valid_from/valid_to) se comparan y serializan como
// fechas de calendario, sin la deriva de zona horaria que introduce un Date.
pg.types.setTypeParser(1082, (value) => value);

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

export type DbPool = pg.Pool;
