import type { UMLModel } from '../../src/model/types';
import { attr, cls, rel, toRelationalModel, ONE, MANY } from './umlBuilders';

/** Fixture para la Fase 12 (prueba de aceptación B, regla 43): un dominio completamente distinto al de Ventas -- Paciente/Medico/Consulta -- para demostrar que el mismo backend generado (y el mismo cliente móvil) descubre entidades distintas sin ningún cambio de código. */
export function buildClinicaModel(): UMLModel {
  return {
    classes: [
      cls('paciente', 'Paciente', [attr('pa-id', 'id', 'Long', true), attr('pa-nombre', 'nombre', 'String')]),
      cls('medico', 'Medico', [attr('m-id', 'id', 'Long', true), attr('m-nombre', 'nombre', 'String')]),
      cls('consulta', 'Consulta', [attr('c-id', 'id', 'Long', true), attr('c-fecha', 'fecha', 'Date')]),
    ],
    relationships: [
      // Un paciente/médico tiene muchas consultas -- no 1:1 (eso ya lo prueba el fixture oneToOne.ts).
      rel('r-consulta-paciente', 'ASSOCIATION', 'paciente', 'consulta', ONE, MANY),
      rel('r-consulta-medico', 'ASSOCIATION', 'medico', 'consulta', ONE, MANY),
    ],
  };
}

export const clinicaRelationalModel = () => toRelationalModel(buildClinicaModel());
