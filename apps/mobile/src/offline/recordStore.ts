/**
 * Abstracción mínima de almacenamiento persistente clave-valor (Fase 17).
 * Ni `LocalDataSource` ni `SyncQueue` saben nada de SQLite directamente --
 * solo hablan con esto, igual que `CommandExecutor` no sabe nada de HTTP y
 * solo habla con `DynamicDataSource` (mismo patrón que Fase 16 con
 * `SpeechRecognitionProvider`). La implementación real (`sqliteRecordStore.ts`)
 * es un adaptador delgado sobre `expo-sqlite`, verificado en vivo en el
 * dispositivo -- toda la lógica de negocio (cola de sync, reescritura de
 * ids, detección de conflictos) se testea unitariamente contra
 * `InMemoryRecordStore`, sin tocar SQLite para nada.
 */
export interface KeyValueRecordStore<T extends { id: string }> {
  getAll(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  put(record: T): Promise<void>;
  delete(id: string): Promise<void>;
}

export class InMemoryRecordStore<T extends { id: string }> implements KeyValueRecordStore<T> {
  private readonly records = new Map<string, T>();

  async getAll(): Promise<T[]> {
    return Array.from(this.records.values());
  }

  async get(id: string): Promise<T | null> {
    return this.records.get(id) ?? null;
  }

  async put(record: T): Promise<void> {
    this.records.set(record.id, record);
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}
