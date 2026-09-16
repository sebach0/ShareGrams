import type { Prisma } from '@prisma/client';

/**
 * Prisma no acepta `undefined` dentro de un valor Json (los campos UML
 * opcionales, como la multiplicidad ausente en una generalización, quedan
 * como `undefined` en el objeto en memoria). Este round-trip por JSON
 * elimina esas claves antes de persistir, igual que haría `JSON.stringify`.
 */
export function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
