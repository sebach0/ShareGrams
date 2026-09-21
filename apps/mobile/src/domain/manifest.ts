/**
 * Los tipos del Domain Manifest NO se duplican acá -- son los mismos que
 * ya generó/definió `packages/uml-core` (Fase 12, generator/manifest). La
 * app móvil los importa directamente del mismo paquete que ya usan
 * apps/web y apps/api: si el contrato cambia, cambia en un solo lugar.
 */
export type {
  DomainManifest,
  DomainType,
  EntityDefinition,
  FieldDefinition,
  IdDefinition,
  Operation,
  RelationCardinality,
  RelationDefinition,
} from '@sharegrams/uml-core';
