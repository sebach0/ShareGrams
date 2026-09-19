#!/usr/bin/env node
/**
 * Prueba de integración de la Fase 10, separada de `npm test` a propósito
 * (regla 35/38): necesita red (descarga dependencias Maven la primera vez)
 * y toma bastante más que la suite unitaria, así que no corre en cada
 * `npm test`. Uso:
 *
 *   node scripts/verifyGeneratedBackend.mjs
 *
 * Requiere Maven en PATH (o `MAVEN_BIN=/ruta/a/mvn` apuntando al binario).
 * Construye un UMLModel de prueba (el mismo caso de aceptación de las
 * Fases 9/10: Cliente/Pedido/Producto + pedido_producto, más un caso de
 * herencia Persona/Cliente para ejercitar JOINED), lo lleva hasta un
 * proyecto Spring Boot generado, lo escribe en un directorio temporal, y
 * corre `mvn -q compile` de verdad sobre ese proyecto.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

// Se importa el build CJS (no el ESM): el ESM de este paquete emite imports
// relativos sin extensión ".js", que Node en modo ESM estricto no resuelve
// -- consumido normalmente por Vite (que sí lo tolera), no por Node directo.
// No es algo a corregir en esta fase, solo hay que evitarlo acá.
const { createRequire } = await import('node:module');
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
const MANY = { lower: 0, upper: '*' };

const model = {
  classes: [
    cls('cliente', 'Cliente', [attr('c-id', 'id', 'Long', true), attr('c-nombre', 'nombre', 'String'), attr('c-email', 'email', 'String')]),
    cls('pedido', 'Pedido', [attr('p-id', 'id', 'Long', true), attr('p-fecha', 'fecha', 'Date'), attr('p-total', 'total', 'BigDecimal')]),
    cls('producto', 'Producto', [attr('pr-id', 'id', 'Long', true), attr('pr-nombre', 'nombre', 'String'), attr('pr-precio', 'precio', 'BigDecimal')]),
    cls('persona', 'Persona', [attr('pe-id', 'id', 'Long', true), attr('pe-nombre', 'nombre', 'String')]),
    cls('empleado', 'Empleado', [attr('em-salario', 'salario', 'BigDecimal')]),
  ],
  relationships: [
    rel('r-cliente-pedido', 'ASSOCIATION', 'cliente', 'pedido', ONE, MANY),
    rel('r-pedido-producto', 'ASSOCIATION', 'pedido', 'producto', MANY, MANY),
    rel('g-empleado-persona', 'GENERALIZATION', 'empleado', 'persona'),
  ],
};

console.log('== Fase 9: UML -> RelationalModel ==');
const transformResult = transformUmlToRelational(model);
if (!transformResult.ok) {
  console.error('FALLÓ la transformación:', transformResult.errors);
  process.exit(1);
}
console.log(`OK: ${transformResult.model.tables.length} tablas.`);

console.log('== Fase 10: RelationalModel -> Spring Boot project ==');
const generationResult = generateSpringBootProject(transformResult.model);
if (!generationResult.ok) {
  console.error('FALLÓ la generación:', generationResult.errors);
  process.exit(1);
}
console.log(`OK: ${generationResult.project.files.length} archivos generados.`);

const outDir = mkdtempSync(join(tmpdir(), 'sharegrams-generated-backend-'));
console.log(`== Escribiendo proyecto en ${outDir} ==`);
for (const file of generationResult.project.files) {
  const fullPath = join(outDir, file.path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, file.content, 'utf8');
}

const mavenBin = process.env.MAVEN_BIN || (process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
console.log(`== Compilando con ${mavenBin} (esto puede tardar la primera vez, descarga dependencias) ==`);
const result = spawnSync(mavenBin, ['-q', 'compile'], { cwd: outDir, stdio: 'inherit', shell: true });

if (result.status !== 0) {
  console.error(`\nFALLÓ la compilación del backend generado (exit code ${result.status}). Proyecto en: ${outDir}`);
  process.exit(result.status ?? 1);
}

console.log(`\nCOMPILE SUCCESS. Proyecto generado y compilado en: ${outDir}`);
