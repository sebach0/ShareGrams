import { spawn, execSync, type ChildProcess } from 'node:child_process';

export interface SpringBootProcessConfig {
  jarPath: string;
  port: number;
  dbUrl: string;
  dbUser: string;
  dbPassword: string;
  /** Ruta HTTP usada como señal de "está listo" (regla 12): normalmente el propio GET-lista de una entidad del fixture, que solo responde 200 una vez que Spring Boot arrancó Y logró conectarse a PostgreSQL -- una señal más fuerte que un simple health check. */
  readinessPath: string;
  readinessTimeoutMs?: number;
}

export interface RunningSpringBootApp {
  baseUrl: string;
  logs(): string;
  stop(): void;
}

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${child.pid} /t /f`, { stdio: 'ignore' });
    } catch {
      // ya estaba muerto -- no es un error
    }
  } else {
    child.kill('SIGKILL');
  }
}

async function pingOk(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.status < 500; // cualquier respuesta HTTP real (incluso 404) implica que el server está vivo; acá se usa un path que da 200
  } catch {
    return false; // connection refused / aún no levantó
  }
}

/**
 * Arranca el jar generado como un proceso Java independiente (no vía `mvn
 * spring-boot:run`, para no tener un proceso Maven de más que matar) y
 * espera activamente hasta que responda por HTTP -- nunca un sleep fijo
 * (regla 12). Si no arranca a tiempo, mata el proceso y adjunta los logs
 * capturados al error para que sea diagnosticable.
 */
export async function startSpringBootApp(config: SpringBootProcessConfig): Promise<RunningSpringBootApp> {
  const baseUrl = `http://localhost:${config.port}`;
  let logBuffer = '';

  const child = spawn('java', ['-jar', config.jarPath], {
    env: {
      ...process.env,
      SERVER_PORT: String(config.port),
      DB_URL: config.dbUrl,
      DB_USER: config.dbUser,
      DB_PASSWORD: config.dbPassword,
    },
  });
  child.stdout.on('data', (chunk) => { logBuffer += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logBuffer += chunk.toString(); });

  let exited = false;
  let exitInfo = '';
  child.on('exit', (code, signal) => {
    exited = true;
    exitInfo = `code=${code} signal=${signal}`;
  });

  const timeoutMs = config.readinessTimeoutMs ?? 60_000;
  const deadline = Date.now() + timeoutMs;
  const readinessUrl = `${baseUrl}${config.readinessPath}`;

  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`El backend generado terminó antes de estar listo (${exitInfo}).\n\n--- logs ---\n${logBuffer}`);
    }
    if (await pingOk(readinessUrl)) {
      return {
        baseUrl,
        logs: () => logBuffer,
        stop: () => killProcessTree(child),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  killProcessTree(child);
  throw new Error(`El backend generado no respondió en ${timeoutMs}ms (${readinessUrl}).\n\n--- logs ---\n${logBuffer}`);
}
