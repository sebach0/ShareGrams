import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface MavenRunResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function mavenBin(): string {
  return process.env.MAVEN_BIN || (process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
}

function runMaven(projectDir: string, args: string[]): MavenRunResult {
  const result = spawnSync(mavenBin(), args, { cwd: projectDir, encoding: 'utf8', shell: true });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** `mvn compile` (regla 11): captura exit code/stdout/stderr para poder mostrar un error diagnosticable si falla. */
export function compileProject(projectDir: string): MavenRunResult {
  return runMaven(projectDir, ['-q', '-B', 'compile']);
}

/**
 * `mvn -DskipTests package`: produce el jar ejecutable que después arranca
 * springBootProcess.ts. Se empaqueta (no se usa `mvn spring-boot:run`) para
 * tener un único proceso Java simple de matar al terminar, en vez de un
 * proceso Maven que a su vez lanza otro proceso hijo.
 */
export function packageProject(projectDir: string): MavenRunResult {
  return runMaven(projectDir, ['-q', '-B', '-DskipTests', 'package']);
}

/** Ubica el jar ejecutable que dejó `package` (excluye el *.jar.original que deja el repackage de Spring Boot). */
export function findExecutableJar(projectDir: string): string {
  const targetDir = join(projectDir, 'target');
  const matches = readdirSync(targetDir).filter((f) => f.endsWith('.jar') && !f.endsWith('.jar.original'));
  if (matches.length === 0) throw new Error(`No se encontró ningún jar ejecutable en ${targetDir} -- ¿falló el package?`);
  return join(targetDir, matches[0]);
}

export function formatMavenFailure(label: string, projectDir: string, result: MavenRunResult): string {
  return `${label}\nProyecto: ${projectDir}\nExit code: ${result.exitCode}\n\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`;
}
