import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/**
 * No hay Docker disponible en este entorno (verificado al inspeccionar
 * antes de implementar la Fase 11) -- ni Testcontainers ni Docker Compose
 * son viables. Adaptación documentada: se usa el PostgreSQL local real que
 * ya corre para `apps/api` (mismo que usa la app en desarrollo), pero
 * NUNCA la base `sharegrams` de la app -- cada corrida crea su propia base
 * aislada y descartable (CREATE/DROP DATABASE), nunca H2 ni un mock.
 */
export interface TestDatabaseConfig {
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
}

const DEFAULT_CONFIG: TestDatabaseConfig = {
  host: process.env.E2E_DB_HOST || 'localhost',
  port: Number(process.env.E2E_DB_PORT || 5432),
  adminUser: process.env.E2E_DB_USER || 'sharegrams_app',
  adminPassword: process.env.E2E_DB_PASSWORD || 'sharegrams_dev_pw',
};

export interface TestDatabase {
  name: string;
  url: string;
  user: string;
  password: string;
  drop(): void;
  /** Corre una consulta SQL vía psql y devuelve las filas como texto plano (tuples-only, sin alinear) -- suficiente para las verificaciones de esquema de la regla 25, sin traer un driver `pg`. */
  query(sql: string): string[];
}

function runPsql(config: TestDatabaseConfig, database: string, sql: string): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(
    'psql',
    ['-h', config.host, '-p', String(config.port), '-U', config.adminUser, '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', env: { ...process.env, PGPASSWORD: config.adminPassword } },
  );
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Crea una base de datos nueva y aislada para una corrida de fixture. El nombre incluye un sufijo aleatorio (regla 10: aislamiento) -- nunca reutiliza una base entre fixtures. */
export function createTestDatabase(config: TestDatabaseConfig = DEFAULT_CONFIG): TestDatabase {
  const name = `sharegrams_e2e_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const created = runPsql(config, 'postgres', `CREATE DATABASE ${name};`);
  if (!created.ok) {
    throw new Error(`No se pudo crear la base de datos de prueba "${name}":\n${created.stderr}`);
  }

  return {
    name,
    url: `jdbc:postgresql://${config.host}:${config.port}/${name}`,
    user: config.adminUser,
    password: config.adminPassword,
    drop() {
      // Hibernate mantiene el pool de conexiones abierto un instante después de que el proceso Java termina;
      // reintenta unas pocas veces antes de rendirse (nunca deja la base huérfana silenciosamente).
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const result = runPsql(config, 'postgres', `DROP DATABASE IF EXISTS ${name} WITH (FORCE);`);
        if (result.ok) return;
        if (attempt === 4) throw new Error(`No se pudo borrar la base de datos de prueba "${name}":\n${result.stderr}`);
      }
    },
    query(sql: string): string[] {
      const result = spawnSync(
        'psql',
        ['-h', config.host, '-p', String(config.port), '-U', config.adminUser, '-d', name, '-t', '-A', '-c', sql],
        { encoding: 'utf8', env: { ...process.env, PGPASSWORD: config.adminPassword } },
      );
      if (result.status !== 0) throw new Error(`Falló la consulta de introspección contra "${name}":\n${result.stderr}`);
      return (result.stdout ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    },
  };
}
