#!/usr/bin/env node
/**
 * A diferencia de scripts/verifyGeneratedBackend.mjs (que compila y listo)
 * y de e2e/ (que arranca, prueba y apaga todo solo), este script deja el
 * backend generado CORRIENDO en localhost para que un humano lo pruebe a
 * mano desde el navegador/Postman -- Ctrl+C para apagarlo.
 *
 * Uso: MAVEN_BIN=/ruta/a/mvn PORT=8091 DOMAIN=ventas node scripts/runGeneratedBackendLocally.mjs
 *      MAVEN_BIN=/ruta/a/mvn PORT=8092 DOMAIN=clinica node scripts/runGeneratedBackendLocally.mjs
 *
 * DOMAIN elige el modelo UML de ejemplo (ventas | clinica, default ventas)
 * -- pensado para la Fase 12: correr los dos a la vez, en puertos
 * distintos, y conectar la app móvil a cada uno para ver cómo descubre
 * entidades completamente distintas sin recompilar nada.
 */
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transformUmlToRelational, generateSpringBootProject } = require('../dist/cjs/index.js');

function attr(id, name, type, isPrimaryKey = false) {
  return { id, name, type, isPrimaryKey: isPrimaryKey || undefined };
}
function cls(id, name, attributes = []) {
  return { id, name, attributes, position: { x: 0, y: 0 } };
}
function rel(id, type, sourceClassId, targetClassId, sourceMultiplicity, targetMultiplicity) {
  return { id, type, sourceClassId, targetClassId, sourceMultiplicity, targetMultiplicity };
}
const ONE = { lower: 1, upper: 1 };
const ZERO_OR_ONE = { lower: 0, upper: 1 };
const MANY = { lower: 0, upper: '*' };

const MODELS = {
  ventas: {
    classes: [
      cls('cliente', 'Cliente', [attr('c-id', 'id', 'Long', true), attr('c-nombre', 'nombre', 'String'), attr('c-email', 'email', 'String')]),
      cls('pedido', 'Pedido', [attr('p-id', 'id', 'Long', true), attr('p-fecha', 'fecha', 'Date'), attr('p-total', 'total', 'BigDecimal')]),
      cls('producto', 'Producto', [attr('pr-id', 'id', 'Long', true), attr('pr-nombre', 'nombre', 'String'), attr('pr-precio', 'precio', 'BigDecimal')]),
      cls('persona', 'Persona', [attr('pe-id', 'id', 'Long', true), attr('pe-nombre', 'nombre', 'String')]),
      cls('empleado', 'Empleado', [attr('em-salario', 'salario', 'BigDecimal')]),
    ],
    relationships: [
      rel('r-cliente-pedido', 'ASSOCIATION', 'cliente', 'pedido', ZERO_OR_ONE, MANY),
      rel('r-pedido-producto', 'ASSOCIATION', 'pedido', 'producto', MANY, MANY),
      rel('g-empleado-persona', 'GENERALIZATION', 'empleado', 'persona'),
    ],
  },
  clinica: {
    classes: [
      cls('paciente', 'Paciente', [attr('pa-id', 'id', 'Long', true), attr('pa-nombre', 'nombre', 'String')]),
      cls('medico', 'Medico', [attr('m-id', 'id', 'Long', true), attr('m-nombre', 'nombre', 'String')]),
      cls('consulta', 'Consulta', [attr('c-id', 'id', 'Long', true), attr('c-fecha', 'fecha', 'Date')]),
    ],
    relationships: [
      rel('r-consulta-paciente', 'ASSOCIATION', 'paciente', 'consulta', ONE, MANY),
      rel('r-consulta-medico', 'ASSOCIATION', 'medico', 'consulta', ONE, MANY),
    ],
  },
};

const domain = process.env.DOMAIN || 'ventas';
const model = MODELS[domain];
if (!model) { console.error(`DOMAIN desconocido: "${domain}". Opciones: ${Object.keys(MODELS).join(', ')}`); process.exit(1); }

console.log(`== Fase 9+10: generando el backend de ejemplo ("${domain}") ==`);
const transformResult = transformUmlToRelational(model);
if (!transformResult.ok) { console.error(transformResult.errors); process.exit(1); }
const generationResult = generateSpringBootProject(transformResult.model, undefined, model);
if (!generationResult.ok) { console.error(generationResult.errors); process.exit(1); }

const outDir = join(process.cwd(), `.local-generated-backend-${domain}`);
rmSync(outDir, { recursive: true, force: true });
for (const file of generationResult.project.files) {
  const fullPath = join(outDir, file.path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, file.content, 'utf8');
}
console.log(`Proyecto escrito en: ${outDir}`);

const dbName = `sharegrams_manual_test_${domain}`;
const dbHost = process.env.E2E_DB_HOST || 'localhost';
const dbPort = process.env.E2E_DB_PORT || '5432';
const dbUser = process.env.E2E_DB_USER || 'sharegrams_app';
const dbPassword = process.env.E2E_DB_PASSWORD || 'sharegrams_dev_pw';

console.log(`== Recreando la base "${dbName}" (limpia en cada corrida) ==`);
spawnSync('psql', ['-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`], {
  env: { ...process.env, PGPASSWORD: dbPassword },
  stdio: 'inherit',
});
spawnSync('psql', ['-h', dbHost, '-p', dbPort, '-U', dbUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${dbName};`], {
  env: { ...process.env, PGPASSWORD: dbPassword },
  stdio: 'inherit',
});

const mavenBin = process.env.MAVEN_BIN || (process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
console.log('== Empaquetando con Maven (mvn -DskipTests package) ==');
const pkg = spawnSync(mavenBin, ['-q', '-B', '-DskipTests', 'package'], { cwd: outDir, stdio: 'inherit', shell: true });
if (pkg.status !== 0) { console.error('Falló el package.'); process.exit(1); }

const jar = readdirSync(join(outDir, 'target')).find((f) => f.endsWith('.jar') && !f.endsWith('.jar.original'));
if (!jar) { console.error('No se encontró el jar.'); process.exit(1); }
const jarPath = join(outDir, 'target', jar);

const port = process.env.PORT || '8080';
console.log(`== Arrancando en http://localhost:${port} (Ctrl+C para apagar) ==`);
console.log(`   Swagger UI: http://localhost:${port}/swagger-ui.html`);
console.log(`   OpenAPI JSON: http://localhost:${port}/v3/api-docs`);
console.log(`   Domain Manifest (Fase 12): http://localhost:${port}/api/meta`);

const child = spawn('java', ['-jar', jarPath], {
  stdio: 'inherit',
  env: { ...process.env, SERVER_PORT: port, DB_URL: `jdbc:postgresql://${dbHost}:${dbPort}/${dbName}`, DB_USER: dbUser, DB_PASSWORD: dbPassword },
});
child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => child.kill('SIGINT'));
