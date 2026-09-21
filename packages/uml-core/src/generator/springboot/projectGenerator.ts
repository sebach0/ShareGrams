import type { UMLModel } from '../../model/types';
import type { RelationalModel } from '../../relational/types';
import { buildGenerationContext } from './context/buildGenerationContext';
import type { GenerationError } from './errors';
import type { GeneratedFile, GeneratedProject, SpringBootGenerationOptions } from './types';
import { DEFAULT_GENERATION_OPTIONS } from './types';
import { renderEntity } from './templates/entity.template';
import { renderEmbeddedId } from './templates/embeddedId.template';
import { renderRepository } from './templates/repository.template';
import { renderService } from './templates/service.template';
import { renderController } from './templates/controller.template';
import { renderRequestDto, renderResponseDto } from './templates/dto.template';
import { renderResourceNotFoundException, renderGlobalExceptionHandler } from './templates/exception.template';
import { renderMainClass, mainClassName } from './templates/mainClass.template';
import { renderApplicationProperties } from './templates/applicationConfig.template';
import { renderPom } from './templates/pom.template';
import { renderReadme } from './templates/readme.template';
import { renderGitignore } from './templates/gitignore.template';
import { renderMetaController } from './templates/metaController.template';
import { renderWebConfig } from './templates/webConfig.template';
import { generateDomainManifest } from '../manifest/manifestGenerator';
import { humanizeLabel } from '../manifest/labels';

export type GenerateProjectResult = { ok: true; project: GeneratedProject } | { ok: false; errors: GenerationError[] };

/**
 * RelationalModel -> GeneratedProject. Función pura: nunca muta `model`
 * (todo lo que hace es leer), y no toca el filesystem -- eso es
 * responsabilidad de otro componente (ProjectWriter/ZipExporter, fuera de
 * esta fase, ver regla 39: generar y empaquetar/escribir son cosas
 * separadas a propósito).
 */
export function generateSpringBootProject(
  model: RelationalModel,
  options: SpringBootGenerationOptions = DEFAULT_GENERATION_OPTIONS,
  // Solo hace falta para el Manifest (Fase 12): nombres/labels originales que el modelo relacional no conserva.
  // Opcional y al final a propósito -- no rompe ninguna llamada existente (varios fixtures de Fase 11 arman
  // un RelationalModel a mano, sin UMLModel de origen; ahí el Manifest cae al label humanizado del nombre de tabla).
  umlModel?: UMLModel,
): GenerateProjectResult {
  const contextResult = buildGenerationContext(model, options);
  if (!contextResult.ok) return { ok: false, errors: contextResult.errors };
  const context = contextResult.context;

  const packagePath = context.packageName.split('.').join('/');
  const javaRoot = `src/main/java/${packagePath}`;
  const files: GeneratedFile[] = [];

  const manifest = generateDomainManifest(umlModel ?? { classes: [], relationships: [] }, model, {
    applicationName: humanizeLabel(options.projectName),
  });

  files.push({ path: 'pom.xml', content: renderPom(options) });
  files.push({ path: 'README.md', content: renderReadme(options) });
  files.push({ path: '.gitignore', content: renderGitignore() });
  files.push({ path: 'src/main/resources/application.properties', content: renderApplicationProperties(options.databaseName) });
  files.push({ path: 'src/main/resources/manifest.json', content: JSON.stringify(manifest, null, 2) });
  files.push({ path: `${javaRoot}/${mainClassName(options.projectName)}.java`, content: renderMainClass(context.packageName, options.projectName) });
  files.push({ path: `${javaRoot}/exception/ResourceNotFoundException.java`, content: renderResourceNotFoundException(context.packageName) });
  files.push({ path: `${javaRoot}/exception/GlobalExceptionHandler.java`, content: renderGlobalExceptionHandler(context.packageName) });
  files.push({ path: `${javaRoot}/controller/MetaController.java`, content: renderMetaController(context.packageName) });
  files.push({ path: `${javaRoot}/config/WebConfig.java`, content: renderWebConfig(context.packageName) });

  for (const entity of context.entities) {
    files.push({ path: `${javaRoot}/model/${entity.className}.java`, content: renderEntity(context.packageName, entity) });
    if (entity.primaryKey.kind === 'embedded') {
      files.push({ path: `${javaRoot}/model/${entity.primaryKey.idClassName}.java`, content: renderEmbeddedId(context.packageName, entity) });
    }
    files.push({ path: `${javaRoot}/repository/${entity.className}Repository.java`, content: renderRepository(context.packageName, entity) });
    files.push({ path: `${javaRoot}/dto/${entity.className}Request.java`, content: renderRequestDto(context.packageName, entity, context.entities) });
    files.push({ path: `${javaRoot}/dto/${entity.className}Response.java`, content: renderResponseDto(context.packageName, entity, context.entities) });
    files.push({ path: `${javaRoot}/service/${entity.className}Service.java`, content: renderService(context.packageName, entity, context.entities) });
    files.push({ path: `${javaRoot}/controller/${entity.className}Controller.java`, content: renderController(context.packageName, entity) });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return { ok: true, project: { files } };
}
