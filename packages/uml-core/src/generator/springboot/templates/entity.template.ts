import type { JavaEntityModel, JavaRelationshipField, JavaScalarField } from '../context/types';
import { renderImports } from './javaImports';

function renderField(javaType: string, name: string): string {
  return `    private ${javaType} ${name};`;
}

function renderScalarField(field: JavaScalarField): string {
  const columnAttrs = field.nullable ? `name = "${field.columnName}"` : `name = "${field.columnName}", nullable = false`;
  return `    @Column(${columnAttrs})\n${renderField(field.javaType, field.fieldName)}`;
}

function renderRelationshipField(rel: JavaRelationshipField): string {
  const kind = rel.kind === 'ONE_TO_ONE' ? 'OneToOne' : 'ManyToOne';
  const optional = rel.nullable ? 'true' : 'false';
  const lines = [`    @${kind}(fetch = FetchType.LAZY, optional = ${optional})`];
  if (rel.mapsIdAttribute) lines.push(`    @MapsId("${rel.mapsIdAttribute}")`);
  const joinColumnAttrs = [`name = "${rel.joinColumnName}"`, `nullable = ${rel.nullable}`];
  if (rel.kind === 'ONE_TO_ONE') joinColumnAttrs.push('unique = true');
  lines.push(`    @JoinColumn(${joinColumnAttrs.join(', ')})`);
  lines.push(renderField(rel.targetClassName, rel.fieldName));
  return lines.join('\n');
}

function renderManyToManyField(rel: JavaEntityModel['manyToMany'][number]): string {
  return [
    '    @ManyToMany',
    '    @JoinTable(',
    `        name = "${rel.joinTableName}",`,
    `        joinColumns = @JoinColumn(name = "${rel.joinColumnName}"),`,
    `        inverseJoinColumns = @JoinColumn(name = "${rel.inverseJoinColumnName}")`,
    '    )',
    `    private Set<${rel.targetClassName}> ${rel.fieldName} = new HashSet<>();`,
  ].join('\n');
}

function toPropertyName(fieldName: string): string {
  return fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
}

function renderAccessors(javaType: string, fieldName: string): string {
  const property = toPropertyName(fieldName);
  return [
    `    public ${javaType} get${property}() {`,
    `        return ${fieldName};`,
    '    }',
    '',
    `    public void set${property}(${javaType} ${fieldName}) {`,
    `        this.${fieldName} = ${fieldName};`,
    '    }',
  ].join('\n');
}

/**
 * Genera la clase @Entity para una tabla. La lógica de QUÉ generar (si es
 * PK simple/compuesta/heredada, qué FK es 1:1 vs N:1, qué tabla es
 * @ManyToMany) ya vino resuelta en JavaEntityModel -- acá solo se
 * interpola texto, sin decidir nada (regla 30 de la Fase 10).
 */
export function renderEntity(packageName: string, entity: JavaEntityModel): string {
  const persistenceImports = new Set<string>(['jakarta.persistence.Entity']);
  const otherImports = new Set<string>();

  if (!entity.extendsClassName) persistenceImports.add('jakarta.persistence.Table');
  if (entity.isInheritanceRoot) {
    persistenceImports.add('jakarta.persistence.Inheritance');
    persistenceImports.add('jakarta.persistence.InheritanceType');
  }

  const idFieldBlocks: string[] = [];
  const idAccessors: string[] = [];

  if (entity.primaryKey.kind === 'simple') {
    persistenceImports.add('jakarta.persistence.Id');
    persistenceImports.add('jakarta.persistence.GeneratedValue');
    persistenceImports.add('jakarta.persistence.GenerationType');
    if (entity.primaryKey.field.importFqcn) otherImports.add(entity.primaryKey.field.importFqcn);
    idFieldBlocks.push(
      ['    @Id', '    @GeneratedValue(strategy = GenerationType.IDENTITY)', renderField(entity.primaryKey.field.javaType, entity.primaryKey.field.fieldName)].join('\n'),
    );
    idAccessors.push(renderAccessors(entity.primaryKey.field.javaType, entity.primaryKey.field.fieldName));
  } else if (entity.primaryKey.kind === 'embedded') {
    persistenceImports.add('jakarta.persistence.EmbeddedId');
    idFieldBlocks.push(['    @EmbeddedId', `    private ${entity.primaryKey.idClassName} id = new ${entity.primaryKey.idClassName}();`].join('\n'));
    idAccessors.push(renderAccessors(entity.primaryKey.idClassName, 'id'));
  } else {
    persistenceImports.add('jakarta.persistence.PrimaryKeyJoinColumn');
  }

  for (const field of entity.scalarFields) {
    persistenceImports.add('jakarta.persistence.Column');
    if (field.importFqcn) otherImports.add(field.importFqcn);
  }

  for (const rel of entity.relationships) {
    persistenceImports.add(rel.kind === 'ONE_TO_ONE' ? 'jakarta.persistence.OneToOne' : 'jakarta.persistence.ManyToOne');
    persistenceImports.add('jakarta.persistence.JoinColumn');
    persistenceImports.add('jakarta.persistence.FetchType');
    if (rel.mapsIdAttribute) persistenceImports.add('jakarta.persistence.MapsId');
  }

  if (entity.manyToMany.length > 0) {
    persistenceImports.add('jakarta.persistence.ManyToMany');
    persistenceImports.add('jakarta.persistence.JoinTable');
    persistenceImports.add('jakarta.persistence.JoinColumn'); // lo usan joinColumns/inverseJoinColumns de @JoinTable, no solo @ManyToOne/@OneToOne
    otherImports.add('java.util.HashSet');
    otherImports.add('java.util.Set');
  }

  const classAnnotations: string[] = ['@Entity'];
  if (!entity.extendsClassName) classAnnotations.push(`@Table(name = "${entity.tableName}")`);
  if (entity.isInheritanceRoot) classAnnotations.push('@Inheritance(strategy = InheritanceType.JOINED)');
  if (entity.primaryKey.kind === 'inherited') classAnnotations.push(`@PrimaryKeyJoinColumn(name = "${entity.primaryKey.joinColumnName}")`);

  const classDeclaration = entity.extendsClassName
    ? `public class ${entity.className} extends ${entity.extendsClassName} {`
    : `public class ${entity.className} {`;

  const bodyBlocks = [
    ...idFieldBlocks,
    ...entity.scalarFields.map(renderScalarField),
    ...entity.relationships.map(renderRelationshipField),
    ...entity.manyToMany.map(renderManyToManyField),
  ];

  const accessorBlocks = [
    ...idAccessors,
    ...entity.scalarFields.map((f) => renderAccessors(f.javaType, f.fieldName)),
    ...entity.relationships.map((r) => renderAccessors(r.targetClassName, r.fieldName)),
    ...entity.manyToMany.map((r) => renderAccessors(`Set<${r.targetClassName}>`, r.fieldName)),
  ];

  const importBlock = renderImports([...persistenceImports, ...otherImports]);

  return `package ${packageName}.model;

${importBlock}

${classAnnotations.join('\n')}
${classDeclaration}

${bodyBlocks.join('\n\n')}

${accessorBlocks.join('\n\n')}
}
`;
}
