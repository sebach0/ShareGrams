export interface EnvConfig {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  port: number;
  /** Ausente en dev si todavía no se configuró: el asistente de IA es una feature opcional, no debe tumbar el arranque del resto de la API. */
  anthropicApiKey?: string;
  anthropicModel: string;
}

/**
 * Falla rápido y con un mensaje claro si falta configuración obligatoria,
 * en vez de dejar que Nest arranque a medias y falle más tarde en el
 * primer request que la necesite.
 */
export function loadEnv(): EnvConfig {
  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;

  if (!databaseUrl) {
    throw new Error('Falta la variable de entorno DATABASE_URL. Copiá .env.example a .env y completala.');
  }
  if (!jwtSecret) {
    throw new Error('Falta la variable de entorno JWT_SECRET. Copiá .env.example a .env y completala.');
  }

  return {
    databaseUrl,
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    port: Number(process.env.PORT ?? 3000),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
  };
}
