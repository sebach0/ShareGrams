import * as SQLite from 'expo-sqlite';

/**
 * Una sola base SQLite para toda la app (Fase 17) -- dos tablas
 * genéricas, ninguna por entidad (regla 7: prohibido `PacienteLocal`/
 * `ClienteLocal`). Cada fila guarda un registro como JSON en `data`; el
 * resto de columnas son solo para poder indexar/filtrar sin tener que
 * traer y parsear todo a JS primero.
 */
const DB_NAME = 'sharegrams-offline.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getLocalDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS local_entities (
          local_id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          data TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_local_entities_entity_type ON local_entities(entity_type);

        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          created_at TEXT NOT NULL,
          data TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return dbPromise;
}
