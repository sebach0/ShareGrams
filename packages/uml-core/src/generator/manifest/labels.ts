/** Fallback determinista cuando no hay un UMLClass/UMLAttribute de origen del que sacar el nombre "real" (ej. una tabla asociativa con atributos propios, que no viene de ninguna clase UML -- ver Fase 9). "fecha_registro" -> "Fecha Registro". */
export function humanizeLabel(snakeOrCamelCaseName: string): string {
  const withSpaces = snakeOrCamelCaseName
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return withSpaces
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function pluralize(label: string): string {
  return `${label}s`;
}
