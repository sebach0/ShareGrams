/** Mismo formato {code, message} que TransformationError/ModelValidationError/CommandError en el resto del repo. */
export interface GenerationError {
  code: string;
  message: string;
}

export function generationError(code: string, message: string): GenerationError {
  return { code, message };
}
