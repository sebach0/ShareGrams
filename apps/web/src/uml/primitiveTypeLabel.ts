import type { PrimitiveType } from '@sharegrams/uml-core';

/**
 * Nombre a mostrar en la UI para cada PrimitiveType. Separado del valor real
 * (que sigue siendo "BigDecimal" en todo el resto del sistema -- modelo,
 * mapeo relacional, generador Spring Boot) porque ese nombre viene de
 * java.math.BigDecimal y no es el que alguien esperaría elegir para un
 * precio o un monto con decimales.
 */
const LABELS: Record<PrimitiveType, string> = {
  String: 'String',
  Integer: 'Integer',
  Long: 'Long',
  Double: 'Double',
  Boolean: 'Boolean',
  Date: 'Date',
  DateTime: 'DateTime',
  BigDecimal: 'Decimal',
};

export function primitiveTypeLabel(type: PrimitiveType): string {
  return LABELS[type] ?? type;
}
