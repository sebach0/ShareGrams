/** Representación intermedia de un archivo generado -- nunca se escribe a disco directamente desde acá (eso es responsabilidad de otro componente, ver comentario en projectGenerator.ts). */
export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedProject {
  files: GeneratedFile[];
}

/** Opciones mínimas necesarias para generar el proyecto -- a propósito no se sobrecarga con más configuración de la que hace falta. */
export interface SpringBootGenerationOptions {
  projectName: string;
  packageName: string;
  databaseName: string;
}

export const DEFAULT_GENERATION_OPTIONS: SpringBootGenerationOptions = {
  projectName: 'generated-backend',
  packageName: 'com.sharegrams.generated',
  databaseName: 'generated_db',
};
