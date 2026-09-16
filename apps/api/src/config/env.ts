export interface EnvConfig {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  port: number;
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
  };
}
