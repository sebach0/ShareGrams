/**
 * Estrategia de nombres del generador Java: único lugar que sabe pasar de
 * snake_case (como vienen tablas/columnas del RelationalModel) a
 * PascalCase/camelCase. Espejo de relational/naming.ts pero en la
 * dirección inversa.
 */

function splitSnakeCase(name: string): string[] {
  return name
    .trim()
    .split(/[_\s-]+/)
    .filter((part) => part.length > 0);
}

/** "detalle_pedido" -> "DetallePedido" (nombre de clase/entidad Java). */
export function toPascalCase(snakeCaseName: string): string {
  return splitSnakeCase(snakeCaseName)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/** "fecha_registro" -> "fechaRegistro" (nombre de campo/variable Java). */
export function toCamelCase(snakeCaseName: string): string {
  const pascal = toPascalCase(snakeCaseName);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function entityClassName(tableName: string): string {
  return toPascalCase(tableName);
}

export function fieldName(columnName: string): string {
  return toCamelCase(columnName);
}

/**
 * Pluralización determinista para segmentos de ruta REST: siempre agrega
 * "s" al nombre de tabla (snake_case). A propósito NO intenta resolver
 * plurales irregulares del español (ej. "capaz" -> "capaces"): sería una
 * solución lingüística mucho más compleja de lo que pide esta fase.
 */
export function routeSegment(tableName: string): string {
  return `${tableName}s`;
}

/** Nombre de la clase embebida de PK compuesta: "pedido_producto" -> "PedidoProductoId". */
export function embeddedIdClassName(tableName: string): string {
  return `${toPascalCase(tableName)}Id`;
}

const JAVA_PACKAGE_SEGMENT = /^[a-z][a-z0-9]*$/;

/** Java exige que cada segmento del package empiece con letra minúscula y solo tenga letras/dígitos (simplificación deliberada: no contempla keywords reservadas ni unicode). */
export function isValidJavaPackageName(packageName: string): boolean {
  if (!packageName) return false;
  return packageName.split('.').every((segment) => JAVA_PACKAGE_SEGMENT.test(segment));
}
