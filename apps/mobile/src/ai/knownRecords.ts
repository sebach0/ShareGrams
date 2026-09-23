import type { DomainManifest } from '../domain/manifest';
import type { DynamicDataSource } from '../offline/dynamicDataSource';

export type KnownRecords = Record<string, Array<{ id: unknown; label: string }>>;

const MAX_RECORDS_PER_ENTITY = 20;

/**
 * Antes de mandarle la instrucción a Claude, le sumamos qué registros ya
 * existen (id + su displayField) para las entidades que son destino de
 * alguna relación -- sin esto, Claude no tiene forma de resolver "la
 * universidad UMSA" a un id real dentro de una sola llamada a herramienta
 * (el intérprete no encadena LIST->CREATE, ver dynamic-assistant.service.ts
 * del lado del servidor), y termina preguntando el id siempre, incluso
 * cuando el registro ya existe.
 *
 * Esta consulta la hace la app móvil (nunca el servidor, que no
 * necesariamente puede llegar a la URL del backend generado -- puede ser
 * una dirección solo válida desde el emulador, ej. 10.0.2.2). Capada a
 * MAX_RECORDS_PER_ENTITY por entidad: para el tamaño de un proyecto
 * académico sobra, y evita un prompt gigante si alguien cargó muchas filas.
 */
export async function buildKnownRecords(manifest: DomainManifest, repository: DynamicDataSource): Promise<KnownRecords> {
  const targetEntityNames = new Set(manifest.entities.flatMap((e) => e.relations.map((r) => r.targetEntity)));
  const relevantEntities = manifest.entities.filter((e) => targetEntityNames.has(e.name) && e.id && e.operations.includes('LIST'));

  const known: KnownRecords = {};
  await Promise.all(
    relevantEntities.map(async (entity) => {
      const result = await repository.list(entity);
      if (result.kind !== 'ok') return;
      const idFieldName = entity.id!.fields[0].name;
      const records = result.value.slice(0, MAX_RECORDS_PER_ENTITY).map((record) => ({
        id: record.values[idFieldName],
        label: String(record.values[entity.displayField] ?? record.values[idFieldName]),
      }));
      if (records.length > 0) known[entity.name] = records;
    }),
  );
  return known;
}
