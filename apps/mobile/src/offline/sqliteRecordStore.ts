import type * as SQLite from 'expo-sqlite';
import type { KeyValueRecordStore } from './recordStore';

interface Row {
  local_id?: string;
  id?: string;
  data: string;
}

/**
 * Implementación real de `KeyValueRecordStore` sobre `expo-sqlite`
 * (Fase 17). Deliberadamente "tonta": guarda cada registro completo como
 * JSON en una sola columna `data` -- no hay columnas por campo de
 * entidad, así que agregar/quitar campos de un dominio nunca requiere
 * una migración de esquema. `entity_type` se guarda aparte solo como
 * índice para no tener que traer y parsear TODA la tabla a JS en cada
 * consulta.
 *
 * Este archivo es el único punto de todo el módulo offline que toca
 * SQLite de verdad -- por eso mismo es el único que NO tiene tests
 * unitarios (no hay motor SQLite real disponible en Vitest/Node): se
 * verificó en vivo en el dispositivo, mismo criterio que
 * `expoSpeechRecognitionProvider.ts` en Fase 16. Toda la lógica de
 * negocio (`LocalDataSource`, `SyncQueue`, `SyncEngine`) se testea contra
 * `InMemoryRecordStore`, que implementa exactamente la misma interfaz.
 */
export class SqliteRecordStore<T extends { id: string }> implements KeyValueRecordStore<T> {
  constructor(
    private readonly db: SQLite.SQLiteDatabase,
    private readonly table: 'local_entities' | 'sync_queue',
  ) {}

  private idColumn(): string {
    return this.table === 'local_entities' ? 'local_id' : 'id';
  }

  async getAll(): Promise<T[]> {
    const rows = await this.db.getAllAsync<Row>(`SELECT data FROM ${this.table}`);
    return rows.map((row) => JSON.parse(row.data) as T);
  }

  async get(id: string): Promise<T | null> {
    const row = await this.db.getFirstAsync<Row>(`SELECT data FROM ${this.table} WHERE ${this.idColumn()} = ?`, id);
    return row ? (JSON.parse(row.data) as T) : null;
  }

  async put(record: T): Promise<void> {
    const entityType = (record as unknown as { entityType?: string }).entityType ?? '';
    const createdAt = (record as unknown as { createdAt?: string }).createdAt ?? '';
    if (this.table === 'local_entities') {
      await this.db.runAsync(
        `INSERT INTO local_entities (local_id, entity_type, data) VALUES (?, ?, ?)
         ON CONFLICT(local_id) DO UPDATE SET entity_type = excluded.entity_type, data = excluded.data`,
        record.id,
        entityType,
        JSON.stringify(record),
      );
    } else {
      await this.db.runAsync(
        `INSERT INTO sync_queue (id, entity_type, created_at, data) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET entity_type = excluded.entity_type, created_at = excluded.created_at, data = excluded.data`,
        record.id,
        entityType,
        createdAt,
        JSON.stringify(record),
      );
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.runAsync(`DELETE FROM ${this.table} WHERE ${this.idColumn()} = ?`, id);
  }
}
