import { IsObject } from 'class-validator';
import type { UMLModel } from '@sharegrams/uml-core';

/**
 * Solo validamos acá que el body tenga forma de objeto. La validación real
 * de que sea un UMLModel coherente (ids únicos, relaciones sin referencias
 * colgantes) la hace `validateModel` de @sharegrams/uml-core en el servicio,
 * para no duplicar las reglas del dominio en dos lugares distintos.
 */
export class SaveDiagramDto {
  @IsObject()
  model!: UMLModel;
}
