import type { JavaEntityModel } from '../context/types';
import { renderImports } from './javaImports';

function repoFieldName(entity: JavaEntityModel): string {
  return `${entity.className.charAt(0).toLowerCase()}${entity.className.slice(1)}Repository`;
}

/**
 * Nombre real del campo de PK de una entidad -- NUNCA asumir "id" (bug real
 * encontrado en producción: un usuario nombró su atributo de PK "ci", y el
 * código de acá abajo llamaba `Estudiante::getId` a mano, que no compila
 * porque el getter generado es `getCi()`). Para 'inherited' (JOINED),
 * resuelve hasta la raíz -- ahí vive el @Id real, vía herencia Java.
 */
function resolveIdFieldName(entity: JavaEntityModel, allEntities: JavaEntityModel[]): string {
  if (entity.primaryKey.kind === 'simple') return entity.primaryKey.field.fieldName;
  if (entity.primaryKey.kind === 'inherited') {
    const primaryKey = entity.primaryKey;
    const parent = allEntities.find((e) => e.className === primaryKey.parentClassName)!;
    return resolveIdFieldName(parent, allEntities);
  }
  // 'embedded' (PK compuesta): no hay un único campo id -- no debería llegar
  // acá nunca (una entidad con PK compuesta no puede ser blanco de una
  // relación a-uno/@ManyToMany hoy, ver limitación documentada de Fase 10).
  throw new Error(`service.template: no se puede resolver un id simple para "${entity.className}" (PK compuesta).`);
}

/**
 * Capa de servicio: CRUD mínimo (findAll/findById/create/update/delete),
 * inyección por constructor (regla 13), y un update "seguro" (regla 14):
 * busca la entidad existente, aplica los campos permitidos del Request y
 * recién ahí guarda -- nunca un save(request) ciego que ignore el id real.
 *
 * @Transactional a nivel de clase (encontrado como bug real en la Fase 11,
 * no un adorno): sin esto, cada llamada a un repository abre su propia
 * transacción y la entidad fetcheada en `findById` queda detached para
 * cuando se llama `save`. Para relaciones a-uno (@ManyToOne/@OneToOne) el
 * merge de esa entidad detached igual sincroniza bien, pero para una
 * colección @ManyToMany reemplazada entera (`setX(new HashSet<>(...))`)
 * el merge de una entidad detached puede NO sincronizar la tabla
 * asociativa -- se verificó en runtime contra PostgreSQL real (ver Fase
 * 11): sin @Transactional, un PUT que asocia materias devolvía la
 * respuesta correcta en memoria pero un GET posterior no mostraba nada
 * guardado. Con @Transactional, el fetch-modificación-save de cada método
 * corre en una sola transacción y la entidad permanece managed todo el
 * tiempo, que es la forma correcta de hacer esto en JPA.
 *
 * Entidades con PK compuesta (join table con atributos propios) todavía no
 * generan findById/update/delete -- ver limitación documentada en el
 * informe final de la Fase 10, no es un caso que la Fase 9 produzca hoy.
 */
export function renderService(packageName: string, entity: JavaEntityModel, allEntities: JavaEntityModel[]): string {
  const isEmbedded = entity.primaryKey.kind === 'embedded';
  const relationshipTargets = entity.relationships.map((r) => allEntities.find((e) => e.className === r.targetClassName)!);
  const manyToManyTargets = entity.manyToMany.map((r) => allEntities.find((e) => e.className === r.targetClassName)!);

  // Un mismo repositorio de destino puede hacer falta tanto para una FK simple como para un @ManyToMany -- se inyecta una sola vez.
  const repoTargetsByClassName = new Map<string, JavaEntityModel>();
  for (const target of [...relationshipTargets, ...manyToManyTargets]) repoTargetsByClassName.set(target.className, target);
  const repoTargets = [...repoTargetsByClassName.values()];

  const imports = new Set<string>([
    `${packageName}.dto.${entity.className}Request`,
    `${packageName}.dto.${entity.className}Response`,
    `${packageName}.model.${entity.className}`,
    `${packageName}.repository.${entity.className}Repository`,
    'org.springframework.stereotype.Service',
    'org.springframework.transaction.annotation.Transactional',
    'java.util.List',
    'java.util.stream.Collectors',
  ]);
  if (!isEmbedded || entity.relationships.length > 0) imports.add(`${packageName}.exception.ResourceNotFoundException`);
  if (entity.manyToMany.length > 0) imports.add('java.util.HashSet');
  for (const target of repoTargets) imports.add(`${packageName}.repository.${target.className}Repository`);
  // Las referencias a método tipo `Producto::getId` en toResponse() necesitan la clase model importada
  // (a diferencia de entity.getCliente().getId(), que no nombra la clase directamente).
  for (const target of manyToManyTargets) imports.add(`${packageName}.model.${target.className}`);

  const ownRepoField = repoFieldName(entity);
  const repoFields = repoTargets.map((t) => ({ field: repoFieldName(t), className: t.className }));

  const constructorParams = [
    `${entity.className}Repository ${ownRepoField}`,
    ...repoFields.map((r) => `${r.className}Repository ${r.field}`),
  ].join(', ');
  const constructorAssignments = [
    `        this.${ownRepoField} = ${ownRepoField};`,
    ...repoFields.map((r) => `        this.${r.field} = ${r.field};`),
  ].join('\n');
  const fieldDeclarations = [
    `    private final ${entity.className}Repository ${ownRepoField};`,
    ...repoFields.map((r) => `    private final ${r.className}Repository ${r.field};`),
  ].join('\n');

  const toResponseAssignments: string[] = [];
  if (entity.primaryKey.kind === 'simple') {
    const p = toPropertyName(entity.primaryKey.field.fieldName);
    toResponseAssignments.push(`        response.set${p}(entity.get${p}());`);
  } else if (entity.primaryKey.kind === 'inherited') {
    // El getter del id lo hereda de la superclase (misma jerarquía Java) -- se llama
    // como el campo real de la raíz (no necesariamente "id").
    const rootP = toPropertyName(resolveIdFieldName(entity, allEntities));
    toResponseAssignments.push(`        response.set${rootP}(entity.get${rootP}());`);
  }
  for (const field of entity.scalarFields) {
    const p = toPropertyName(field.fieldName);
    toResponseAssignments.push(`        response.set${p}(entity.get${p}());`);
  }
  for (let i = 0; i < entity.relationships.length; i += 1) {
    const rel = entity.relationships[i];
    const target = relationshipTargets[i];
    const p = toPropertyName(rel.fieldName);
    const idProp = toPropertyName(`${rel.fieldName}Id`);
    const targetIdGetter = `get${toPropertyName(resolveIdFieldName(target, allEntities))}`;
    toResponseAssignments.push(
      `        response.set${idProp}(entity.get${p}() == null ? null : entity.get${p}().${targetIdGetter}());`,
    );
  }
  for (const m2m of entity.manyToMany) {
    const target = allEntities.find((e) => e.className === m2m.targetClassName)!;
    const p = toPropertyName(m2m.fieldName);
    const idsProp = toPropertyName(`${m2m.fieldName}Ids`);
    const targetIdGetter = `get${toPropertyName(resolveIdFieldName(target, allEntities))}`;
    toResponseAssignments.push(
      `        response.set${idsProp}(entity.get${p}().stream().map(${m2m.targetClassName}::${targetIdGetter}).collect(Collectors.toSet()));`,
    );
  }

  const applyAssignments: string[] = [];
  for (const field of entity.scalarFields) {
    const p = toPropertyName(field.fieldName);
    applyAssignments.push(`        entity.set${p}(request.get${p}());`);
  }
  for (let i = 0; i < entity.relationships.length; i += 1) {
    const rel = entity.relationships[i];
    const target = relationshipTargets[i];
    const p = toPropertyName(rel.fieldName);
    const idProp = toPropertyName(`${rel.fieldName}Id`);
    const repoField = repoFieldName(target);
    if (rel.nullable) {
      applyAssignments.push(
        `        if (request.get${idProp}() == null) {`,
        `            entity.set${p}(null);`,
        '        } else {',
        `            entity.set${p}(${repoField}.findById(request.get${idProp}())`,
        `                .orElseThrow(() -> new ResourceNotFoundException("${target.className}", request.get${idProp}())));`,
        '        }',
      );
    } else {
      applyAssignments.push(
        `        entity.set${p}(${repoField}.findById(request.get${idProp}())`,
        `            .orElseThrow(() -> new ResourceNotFoundException("${target.className}", request.get${idProp}())));`,
      );
    }
  }

  for (const m2m of entity.manyToMany) {
    const target = allEntities.find((e) => e.className === m2m.targetClassName)!;
    const p = toPropertyName(m2m.fieldName);
    const idsProp = toPropertyName(`${m2m.fieldName}Ids`);
    const repoField = repoFieldName(target);
    applyAssignments.push(
      `        if (request.get${idsProp}() != null) {`,
      `            entity.set${p}(new HashSet<>(${repoField}.findAllById(request.get${idsProp}())));`,
      '        }',
    );
  }

  // Inherited scalar fields (de la superclase, si la hay) también se copian -- misma lógica, un nivel más de indirección para no repetir el árbol acá.
  function collectInherited(e: JavaEntityModel): JavaEntityModel[] {
    if (!e.extendsClassName) return [];
    const parent = allEntities.find((x) => x.className === e.extendsClassName)!;
    return [parent, ...collectInherited(parent)];
  }
  for (const ancestor of collectInherited(entity)) {
    for (const field of ancestor.scalarFields) {
      const p = toPropertyName(field.fieldName);
      toResponseAssignments.push(`        response.set${p}(entity.get${p}());`);
      applyAssignments.push(`        entity.set${p}(request.get${p}());`);
    }
  }

  const idType = entity.idJavaType;

  const crudMethods = isEmbedded
    ? `    public List<${entity.className}Response> findAll() {
        return ${ownRepoField}.findAll().stream().map(${entity.className}Service::toResponse).collect(Collectors.toList());
    }

    public ${entity.className}Response create(${entity.className}Request request) {
        ${entity.className} entity = new ${entity.className}();
        applyRequest(entity, request);
        return toResponse(${ownRepoField}.save(entity));
    }`
    : `    public List<${entity.className}Response> findAll() {
        return ${ownRepoField}.findAll().stream().map(${entity.className}Service::toResponse).collect(Collectors.toList());
    }

    public ${entity.className}Response findById(${idType} id) {
        return toResponse(${ownRepoField}.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("${entity.className}", id)));
    }

    public ${entity.className}Response create(${entity.className}Request request) {
        ${entity.className} entity = new ${entity.className}();
        applyRequest(entity, request);
        return toResponse(${ownRepoField}.save(entity));
    }

    public ${entity.className}Response update(${idType} id, ${entity.className}Request request) {
        ${entity.className} entity = ${ownRepoField}.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("${entity.className}", id));
        applyRequest(entity, request);
        return toResponse(${ownRepoField}.save(entity));
    }

    public void delete(${idType} id) {
        if (!${ownRepoField}.existsById(id)) {
            throw new ResourceNotFoundException("${entity.className}", id);
        }
        ${ownRepoField}.deleteById(id);
    }`;

  return `package ${packageName}.service;

${renderImports(imports)}

@Service
@Transactional
public class ${entity.className}Service {

${fieldDeclarations}

    public ${entity.className}Service(${constructorParams}) {
${constructorAssignments}
    }

${crudMethods}

    private void applyRequest(${entity.className} entity, ${entity.className}Request request) {
${applyAssignments.join('\n')}
    }

    private static ${entity.className}Response toResponse(${entity.className} entity) {
        ${entity.className}Response response = new ${entity.className}Response();
${toResponseAssignments.join('\n')}
        return response;
    }
}
`;
}

function toPropertyName(fieldName: string): string {
  return fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
}
