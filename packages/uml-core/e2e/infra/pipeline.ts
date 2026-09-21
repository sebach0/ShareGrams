import type { UMLModel } from '../../src/model/types';
import type { RelationalModel } from '../../src/relational/types';
import { generateSpringBootProject } from '../../src/generator/springboot/projectGenerator';
import type { SpringBootGenerationOptions } from '../../src/generator/springboot/types';
import { writeGeneratedProject, removeTempProject } from './tempProject';
import { compileProject, packageProject, findExecutableJar, formatMavenFailure } from './compiler';
import { createTestDatabase, type TestDatabase } from './testDatabase';
import { startSpringBootApp } from './springBootProcess';
import { getFreePort } from './ports';
import { ApiClient } from './httpClient';

export interface RunningGeneratedBackend {
  client: ApiClient;
  baseUrl: string;
  db: TestDatabase;
  projectDir: string;
  /** Detiene el proceso Java, borra la base de datos de prueba y borra el proyecto temporal. Idempotente-safe: siempre debe llamarse en un finally del test (regla 14), nunca queda nada colgado si un assert falla antes. */
  stop(): void;
}

/**
 * El pipeline completo de la regla 26: RelationalModel -> genera -> escribe
 * -> compila -> empaqueta -> levanta una base de datos aislada -> arranca
 * el jar -> espera a que esté listo. Reutiliza Fase 9/10 tal cual (nunca
 * reinterpreta UML ni reimplementa el generador) -- esto es orquestación
 * pura, la única lógica propia de la Fase 11 es "generar, compilar, correr,
 * verificar, limpiar".
 *
 * `readinessPath` debe ser un endpoint real del backend generado (ej.
 * "/api/clientes") que solo responde 200 una vez que Spring Boot conectó
 * de verdad a PostgreSQL -- más fuerte que un simple health check.
 */
export async function startGeneratedBackend(
  model: RelationalModel,
  readinessPath: string,
  options?: SpringBootGenerationOptions,
  umlModel?: UMLModel,
): Promise<RunningGeneratedBackend> {
  const genResult = generateSpringBootProject(model, options, umlModel);
  if (!genResult.ok) {
    throw new Error(`GENERATION_FAILED\n${genResult.errors.map((e) => `${e.code}: ${e.message}`).join('\n')}`);
  }

  const projectDir = writeGeneratedProject(genResult.project);
  const db = createTestDatabase();

  try {
    const compileResult = compileProject(projectDir);
    if (!compileResult.ok) throw new Error(formatMavenFailure('GENERATED_BACKEND_COMPILE_FAILED', projectDir, compileResult));

    const packageResult = packageProject(projectDir);
    if (!packageResult.ok) throw new Error(formatMavenFailure('GENERATED_BACKEND_PACKAGE_FAILED', projectDir, packageResult));

    const jarPath = findExecutableJar(projectDir);
    const port = await getFreePort();
    const app = await startSpringBootApp({
      jarPath,
      port,
      dbUrl: db.url,
      dbUser: db.user,
      dbPassword: db.password,
      readinessPath,
    });

    return {
      client: new ApiClient(app.baseUrl),
      baseUrl: app.baseUrl,
      db,
      projectDir,
      stop() {
        app.stop();
        db.drop();
        removeTempProject(projectDir);
      },
    };
  } catch (err) {
    // Si algo falla antes de terminar de arrancar, no queda ni la base ni el directorio temporal colgados.
    db.drop();
    removeTempProject(projectDir);
    throw err;
  }
}
