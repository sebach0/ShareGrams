import type { JavaEntityModel } from '../context/types';
import { renderImports } from './javaImports';

/** Clase @Embeddable para la PK compuesta de una entidad (join table con atributos, o cualquier tabla con PK de más de una columna). */
export function renderEmbeddedId(packageName: string, entity: JavaEntityModel): string {
  if (entity.primaryKey.kind !== 'embedded') {
    throw new Error(`renderEmbeddedId: la entidad "${entity.className}" no tiene PK compuesta.`);
  }
  const { idClassName, parts } = entity.primaryKey;

  const otherImports = new Set<string>(['java.io.Serializable', 'java.util.Objects']);
  for (const part of parts) if (part.importFqcn) otherImports.add(part.importFqcn);

  const fields = parts.map((p) => `    private ${p.javaType} ${p.attributeName};`).join('\n');

  const constructorArgs = parts.map((p) => `${p.javaType} ${p.attributeName}`).join(', ');
  const constructorAssignments = parts.map((p) => `        this.${p.attributeName} = ${p.attributeName};`).join('\n');

  const accessors = parts
    .map((p) => {
      const property = p.attributeName.charAt(0).toUpperCase() + p.attributeName.slice(1);
      return [
        `    public ${p.javaType} get${property}() {`,
        `        return ${p.attributeName};`,
        '    }',
        '',
        `    public void set${property}(${p.javaType} ${p.attributeName}) {`,
        `        this.${p.attributeName} = ${p.attributeName};`,
        '    }',
      ].join('\n');
    })
    .join('\n\n');

  const equalsChecks = parts.map((p) => `Objects.equals(${p.attributeName}, that.${p.attributeName})`).join(' && ');
  const hashArgs = parts.map((p) => p.attributeName).join(', ');

  return `package ${packageName}.model;

import jakarta.persistence.Embeddable;
${renderImports(otherImports)}

@Embeddable
public class ${idClassName} implements Serializable {

${fields}

    public ${idClassName}() {
    }

    public ${idClassName}(${constructorArgs}) {
${constructorAssignments}
    }

${accessors}

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ${idClassName})) return false;
        ${idClassName} that = (${idClassName}) o;
        return ${equalsChecks};
    }

    @Override
    public int hashCode() {
        return Objects.hash(${hashArgs});
    }
}
`;
}
