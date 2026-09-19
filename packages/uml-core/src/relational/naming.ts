/**
 * Estrategia de nombres centralizada: es el ÚNICO lugar del transformador
 * que sabe cómo pasar de un nombre UML (PascalCase para clases, camelCase
 * para atributos) a un nombre relacional (snake_case). Todo lo demás pide
 * nombres acá en vez de convertir por su cuenta.
 */

/** "DetallePedido" -> "detalle_pedido"; "fechaRegistro" -> "fecha_registro". Sirve para ambos casos (Pascal y camel) porque la regla es la misma: insertar "_" antes de cada mayúscula (salvo la primera letra) y pasar todo a minúscula. */
export function toSnakeCase(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

export function classToTableName(className: string): string {
  return toSnakeCase(className);
}

export function attributeToColumnName(attributeName: string): string {
  return toSnakeCase(attributeName);
}

/**
 * Nombre de la tabla asociativa de una relación N:M: siempre
 * "<tabla_origen>_<tabla_destino>", en ese orden -- determinístico porque
 * se deriva de source/target de la relación, nunca del orden en que
 * aparecen en algún array interno.
 */
export function joinTableName(sourceTableName: string, targetTableName: string): string {
  return `${sourceTableName}_${targetTableName}`;
}

/** Nombre de columna FK que apunta a otra tabla: "<tabla_referenciada>_id". */
export function foreignKeyColumnName(referencedTableName: string): string {
  return `${referencedTableName}_id`;
}
