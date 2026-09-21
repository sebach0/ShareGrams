import { describe, expect, it } from 'vitest';
import { startGeneratedBackend } from './infra/pipeline';
import { buildCoreCrudAndOneToManyModel, coreCrudAndOneToManyRelationalModel } from './fixtures/coreCrudAndOneToMany';
import { buildClinicaModel, clinicaRelationalModel } from './fixtures/clinica';

/**
 * Prueba de aceptación central de la Fase 12 (reglas 42/43/45): el mismo
 * mecanismo de descubrimiento (GET /api/meta + parseo) descubre dos
 * dominios completamente distintos, uno después del otro, sin recompilar
 * ni cambiar una sola línea de código entre medio -- exactamente lo que
 * haría la app móvil al conectar, desconectar, y conectar a otro backend.
 * No se usa la app React Native acá (no hay entorno con emulador/browser
 * headless en este sandbox); se ejercita el mismo fetch + misma validación
 * que ya prueba `apps/mobile/src/api/manifestClient.test.ts` de forma
 * aislada, pero acá contra backends generados reales, compilados y
 * corriendo con PostgreSQL real -- ver limitación documentada en el
 * informe final sobre la confirmación visual en un emulador real.
 */
describe('Fase 12 — aceptación: mismo mecanismo de discovery, dos dominios distintos', () => {
  it('descubre Ventas (Cliente, Pedido) y después, sin recompilar nada, descubre Clínica (Paciente, Medico, Consulta)', async () => {
    const ventas = await startGeneratedBackend(coreCrudAndOneToManyRelationalModel(), '/api/clientes', undefined, buildCoreCrudAndOneToManyModel());
    try {
      const res = await ventas.client.get<{ application: { name: string }; entities: Array<{ name: string }> }>('/api/meta');
      expect(res.status).toBe(200);
      expect(res.body.application.name).toBeTruthy();
      expect(res.body.entities.map((e) => e.name).sort()).toEqual(['Cliente', 'Pedido']);
    } finally {
      ventas.stop();
    }

    // Backend completamente distinto, mismo mecanismo -- ninguna entidad hardcodeada en el paso anterior se reutiliza ni se asume acá.
    const clinica = await startGeneratedBackend(clinicaRelationalModel(), '/api/pacientes', undefined, buildClinicaModel());
    try {
      const res = await clinica.client.get<{ entities: Array<{ name: string }> }>('/api/meta');
      expect(res.status).toBe(200);
      expect(res.body.entities.map((e) => e.name).sort()).toEqual(['Consulta', 'Medico', 'Paciente']);
    } finally {
      clinica.stop();
    }
  });
});
