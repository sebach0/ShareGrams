/**
 * UN registro de CUALQUIER entidad descubierta, sin una clase por dominio
 * (regla 1/6 de la Fase 13: nada de "PacienteEntity"/"ClienteEntity").
 * `values` es el JSON crudo tal como lo devuelve/espera el backend
 * generado -- las claves YA son los nombres reales (`FieldDefinition.name`,
 * `RelationDefinition.name`), no hace falta traducir nada acá.
 *
 * Deliberadamente no sabe hacer HTTP ni nada de UI/Claude/voz (regla 6):
 * es solo una envoltura serializable alrededor de un objeto JSON con su
 * `entityType` asociado.
 */
export interface DynamicEntity {
  entityType: string;
  values: Record<string, unknown>;
}

export function toDynamicEntity(entityType: string, json: unknown): DynamicEntity {
  const values = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  return { entityType, values };
}

/** Serializa de vuelta al JSON plano que espera el backend (ej. body de un POST/PUT). */
export function fromDynamicEntity(entity: DynamicEntity): Record<string, unknown> {
  return { ...entity.values };
}
