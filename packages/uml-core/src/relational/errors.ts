/** Mismo formato que ModelValidationError/CommandError: {code, message}, para que un consumidor externo (futuro endpoint, futura UI) pueda tratarlos igual que cualquier otro diagnóstico del sistema. */
export interface TransformationError {
  code: string;
  message: string;
}

export function transformationError(code: string, message: string): TransformationError {
  return { code, message };
}
