import type { Command } from '@sharegrams/uml-core';

/**
 * A diferencia del asistente de texto (Fase 5), acá no hay nada que
 * resolver contra el modelo actual: todo lo que sale de la imagen es
 * nuevo. La ambigüedad que puede aparecer es interna a la propia imagen
 * (dos clases con el mismo nombre, una relación que apunta a una clase
 * que no se reconoció) -- eso lo maneja image-recognition.resolver.ts.
 */
export interface MultiplicityInput {
  lower: unknown;
  upper: unknown;
}

export interface RecognizedAttribute {
  name: string;
  type: string;
}

export interface RecognizedClass {
  name: string;
  attributes: RecognizedAttribute[];
}

export interface RecognizedRelationship {
  relationshipType: string;
  sourceClassName: string;
  targetClassName: string;
  sourceMultiplicity?: MultiplicityInput;
  targetMultiplicity?: MultiplicityInput;
}

export interface RecognizedDiagram {
  classes: RecognizedClass[];
  relationships: RecognizedRelationship[];
}

export type ImageRecognitionResult =
  /** commands ya viene resuelto contra ids reales, listo para aplicar comando por comando con el dispatch normal del editor -- nunca se persiste desde acá. warnings son cosas que se reconocieron pero no se pudieron traducir a un comando válido (nombre duplicado, relación a una clase no reconocida, multiplicidad ilegible). */
  | { ok: true; commands: Command[]; summary: string; warnings: string[] }
  /** La imagen no parece un diagrama de clases UML legible. */
  | { ok: false; reason: 'unreadable'; message: string }
  /** Falta ANTHROPIC_API_KEY. */
  | { ok: false; reason: 'not_configured'; message: string }
  /** Falla de infraestructura (red, respuesta sin tool_use, etc.). */
  | { ok: false; reason: 'error'; message: string };
