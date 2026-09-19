import type { JavaEntityModel } from '../context/types';
import { renderImports } from './javaImports';

/**
 * Repository mínimo: JpaRepository ya da findAll/findById/save/delete, no
 * hace falta declarar métodos que la interfaz ya provee (regla 12 de la
 * Fase 10). El tipo de PK se toma de JavaEntityModel.idJavaType -- nunca
 * se asume Long.
 */
export function renderRepository(packageName: string, entity: JavaEntityModel): string {
  const imports = new Set<string>([`${packageName}.model.${entity.className}`, 'org.springframework.data.jpa.repository.JpaRepository']);
  if (entity.idImportFqcn) imports.add(entity.idImportFqcn);
  if (entity.primaryKey.kind === 'embedded') imports.add(`${packageName}.model.${entity.idJavaType}`);

  return `package ${packageName}.repository;

${renderImports(imports)}

public interface ${entity.className}Repository extends JpaRepository<${entity.className}, ${entity.idJavaType}> {
}
`;
}
