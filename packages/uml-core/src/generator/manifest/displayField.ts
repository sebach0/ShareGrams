/**
 * Regla 22: qué campo mostrar cuando la app necesita representar una
 * instancia de esta entidad en una sola línea (ej. "Carlos Pérez" en vez
 * de "Cliente #12"). Determinista, sin heurísticas grandes -- exactamente
 * la prioridad que pide la consigna. El modelo UML no tiene todavía forma
 * de marcar un atributo explícitamente como "campo de visualización", así
 * que el primer paso de la lista (1) nunca aplica hoy -- queda documentado
 * y listo para cuando exista esa marca.
 */
const NAME_LIKE_CANDIDATES = ['nombre', 'name', 'titulo'];

export function pickDisplayField(
  fieldNames: string[],
  stringFieldNames: string[],
  pkFieldName: string | undefined,
): string {
  for (const candidate of NAME_LIKE_CANDIDATES) {
    if (fieldNames.includes(candidate)) return candidate;
  }
  if (stringFieldNames.length > 0) return stringFieldNames[0];
  return pkFieldName ?? fieldNames[0];
}
