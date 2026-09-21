#!/usr/bin/env node
/**
 * Complemento de runGeneratedBackendLocally.mjs (que usa modelos de ejemplo
 * fijos, ventas/clinica): este script toma un .zip REAL descargado desde
 * "⚙ Generar Backend" en el editor de ShareGrams -- el de tu propio
 * diagrama -- y automatiza extraer + crear la base de datos (si no existe)
 * + arrancar el backend. Deja el proceso corriendo en foreground (Ctrl+C
 * para apagarlo), igual que runGeneratedBackendLocally.mjs.
 *
 * Uso:
 *   MAVEN_BIN=/tmp/maven/bin/mvn node scripts/runBackendZipLocally.mjs "D:\ruta\a\tu-backend.zip" 8093
 *
 * También acepta ZIP/PORT por variable de entorno en vez de argumentos.
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const zipPath = resolve(process.argv[2] || process.env.ZIP || '');
const port = process.argv[3] || process.env.PORT || '8093';

if (!zipPath || !existsSync(zipPath)) {
  console.error('Uso: node scripts/runBackendZipLocally.mjs <ruta-al-zip> [puerto]');
  console.error(`(ruta recibida: "${zipPath}" -- ¿existe el archivo?)`);
  process.exit(1);
}

const projectName = basename(zipPath).replace(/\.zip$/i, '');
const outDir = join(process.cwd(), `.local-generated-backend-${projectName}`);

console.log(`== Extrayendo "${basename(zipPath)}" en ${outDir} ==`);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const extract = spawnSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Path "${zipPath}" -DestinationPath "${outDir}" -Force`], { stdio: 'inherit' });
if (extract.status !== 0) {
  console.error('Falló la extracción del .zip.');
  process.exit(1);
}

const propsPath = join(outDir, 'src/main/resources/application.properties');
if (!existsSync(propsPath)) {
  console.error(`No se encontró application.properties en el proyecto extraído (${propsPath}) -- ¿es un .zip generado por ShareGrams?`);
  process.exit(1);
}
const props = readFileSync(propsPath, 'utf8');
const dbMatch = props.match(/jdbc:postgresql:\/\/[^/]+\/([a-zA-Z0-9_]+)/);
if (!dbMatch) {
  console.error('No se pudo leer el nombre de la base de datos desde application.properties.');
  process.exit(1);
}
const dbName = dbMatch[1];

const dbHost = process.env.DB_HOST || 'localhost';
const dbPort = process.env.DB_PORT || '5432';
const dbUser = process.env.DB_USER || 'sharegrams_app';
const dbPassword = process.env.DB_PASSWORD || 'sharegrams_dev_pw';

console.log(`== Creando la base "${dbName}" si no existe (usuario ${dbUser}) ==`);
const create = spawnSync('psql', ['-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${dbName};`], {
  env: { ...process.env, PGPASSWORD: dbPassword },
  encoding: 'utf8',
});
if (create.status !== 0 && !/already exists|ya existe/i.test(create.stderr || '')) {
  console.error('Falló la creación de la base de datos:');
  console.error(create.stderr);
  process.exit(1);
}
console.log(create.status === 0 ? '   creada.' : '   ya existía, sigo.');

const mavenBin = process.env.MAVEN_BIN || (process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
console.log(`== Arrancando en http://localhost:${port} (Ctrl+C para apagar) ==`);
console.log(`   Domain Manifest: http://localhost:${port}/api/meta`);
console.log(`   Swagger UI:      http://localhost:${port}/swagger-ui.html`);

const child = spawn(mavenBin, ['spring-boot:run'], {
  cwd: outDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, SERVER_PORT: port, DB_USER: dbUser, DB_PASSWORD: dbPassword },
});
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
