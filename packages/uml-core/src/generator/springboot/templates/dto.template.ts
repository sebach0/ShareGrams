import type { JavaEntityModel } from '../context/types';
import { renderImports } from './javaImports';

/**
 * DTOs planos para cada entidad (ver decisión de arquitectura: Fase 10 §17
 * -- nunca se serializa un @Entity directamente). Una relación FK se
 * expone como su id crudo (ej. `clienteId: Long`), nunca como el objeto
 * anidado: así se evita cualquier ciclo de serialización sin necesidad de
 * @JsonIgnore disperso ni relaciones bidireccionales. Una colección
 * @ManyToMany se expone igual: como un Set<Id> del lado dueño (ej.
 * `productosIds: Set<Long>`), nunca como objetos anidados.
 */

interface FlatField {
  fieldName: string;
  javaType: string;
  importFqcn?: string;
  nullable: boolean;
}

function findEntity(className: string, allEntities: JavaEntityModel[]): JavaEntityModel {
  const found = allEntities.find((e) => e.className === className);
  if (!found) throw new Error(`dto.template: no se encontró la entidad "${className}" al resolver campos heredados/de relación.`);
  return found;
}

function collectOwnAndInheritedScalarFields(entity: JavaEntityModel, allEntities: JavaEntityModel[]): FlatField[] {
  const fields: FlatField[] = entity.scalarFields.map((f) => ({ ...f }));
  if (entity.extendsClassName) {
    fields.push(...collectOwnAndInheritedScalarFields(findEntity(entity.extendsClassName, allEntities), allEntities));
  }
  return fields;
}

/** El id "real" de una entidad: el propio si es 'simple', o el de la raíz de su jerarquía si es 'inherited' (una subclase JOINED no tiene @Id propio). */
function resolveIdField(entity: JavaEntityModel, allEntities: JavaEntityModel[]): FlatField | null {
  if (entity.primaryKey.kind === 'simple') {
    const f = entity.primaryKey.field;
    return { fieldName: f.fieldName, javaType: f.javaType, importFqcn: f.importFqcn, nullable: false };
  }
  if (entity.primaryKey.kind === 'inherited') {
    return resolveIdField(findEntity(entity.primaryKey.parentClassName, allEntities), allEntities);
  }
  // 'embedded': no hay un solo campo "id" -- ya se expresa como los *Id de cada relación (ver resolveRelationshipIdFields), no hace falta (ni compila: la clase *Id vive en el package model, no en dto) un campo "id" aparte.
  return null;
}

function resolveRelationshipIdFields(entity: JavaEntityModel, allEntities: JavaEntityModel[]): FlatField[] {
  return entity.relationships.map((r) => {
    const target = findEntity(r.targetClassName, allEntities);
    return {
      fieldName: `${r.fieldName}Id`,
      javaType: target.idJavaType,
      importFqcn: target.idImportFqcn,
      nullable: r.nullable,
    };
  });
}

function resolveManyToManyIdFields(entity: JavaEntityModel, allEntities: JavaEntityModel[]): FlatField[] {
  return entity.manyToMany.map((r) => {
    const target = findEntity(r.targetClassName, allEntities);
    return {
      fieldName: `${r.fieldName}Ids`,
      javaType: `Set<${target.idJavaType}>`,
      importFqcn: target.idImportFqcn,
      nullable: true, // asociar por N:M es opcional al crear/actualizar -- nunca obligatorio
    };
  });
}

function toPropertyName(fieldName: string): string {
  return fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
}

function renderAccessors(field: FlatField): string {
  const property = toPropertyName(field.fieldName);
  return [
    `    public ${field.javaType} get${property}() {`,
    `        return ${field.fieldName};`,
    '    }',
    '',
    `    public void set${property}(${field.javaType} ${field.fieldName}) {`,
    `        this.${field.fieldName} = ${field.fieldName};`,
    '    }',
  ].join('\n');
}

function renderDto(packageName: string, className: string, fields: FlatField[], withValidation: boolean): string {
  const validationImports = new Set<string>();
  const otherImports = new Set<string>();
  for (const field of fields) {
    if (field.importFqcn) otherImports.add(field.importFqcn);
    if (field.javaType.startsWith('Set<')) otherImports.add('java.util.Set');
    if (withValidation && !field.nullable) {
      validationImports.add(field.javaType === 'String' ? 'jakarta.validation.constraints.NotBlank' : 'jakarta.validation.constraints.NotNull');
    }
  }

  const body = fields
    .map((field) => {
      const annotation =
        withValidation && !field.nullable ? `    ${field.javaType === 'String' ? '@NotBlank' : '@NotNull'}\n` : '';
      return `${annotation}    private ${field.javaType} ${field.fieldName};`;
    })
    .join('\n\n');

  const accessors = fields.map(renderAccessors).join('\n\n');
  const importBlock = renderImports([...validationImports, ...otherImports]);

  return `package ${packageName}.dto;
${importBlock ? `\n${importBlock}\n` : ''}
public class ${className} {

${body}

${accessors}
}
`;
}

/** Request: para crear/actualizar -- nunca lleva id (llega por path variable o se autogenera). */
export function renderRequestDto(packageName: string, entity: JavaEntityModel, allEntities: JavaEntityModel[]): string {
  const fields = [
    ...collectOwnAndInheritedScalarFields(entity, allEntities),
    ...resolveRelationshipIdFields(entity, allEntities),
    ...resolveManyToManyIdFields(entity, allEntities),
  ];
  return renderDto(packageName, `${entity.className}Request`, fields, true);
}

/** Response: incluye el id (propio o heredado; ausente para PK compuesta, ver resolveIdField). */
export function renderResponseDto(packageName: string, entity: JavaEntityModel, allEntities: JavaEntityModel[]): string {
  const idField = resolveIdField(entity, allEntities);
  const fields = [
    ...(idField ? [idField] : []),
    ...collectOwnAndInheritedScalarFields(entity, allEntities),
    ...resolveRelationshipIdFields(entity, allEntities),
    ...resolveManyToManyIdFields(entity, allEntities),
  ];
  return renderDto(packageName, `${entity.className}Response`, fields, false);
}
