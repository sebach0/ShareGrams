import { describe, expect, it } from 'vitest';
// Reutiliza la infraestructura real de la Fase 11 (genera -> compila -> empaqueta
// -> Postgres aislado -> arranca el jar -> espera que responda) -- ES el mismo
// mecanismo que ya prueba que un backend generado funciona de verdad, no una
// reimplementación. Import relativo cruzando de apps/mobile a packages/uml-core
// a propósito: este test vive acá porque lo que se prueba es EL MOTOR de
// apps/mobile, pero la infraestructura para levantar un backend real es de
// packages/uml-core/e2e (no se expone como API pública del paquete, ver Fase 11).
import { startGeneratedBackend } from '../../../packages/uml-core/e2e/infra/pipeline';
import { buildCoreCrudAndOneToManyModel, coreCrudAndOneToManyRelationalModel } from '../../../packages/uml-core/e2e/fixtures/coreCrudAndOneToMany';
import { buildClinicaModel, clinicaRelationalModel } from '../../../packages/uml-core/e2e/fixtures/clinica';
import { loadManifest } from '../src/api/manifestClient';
import { runDynamicCommand } from '../src/engine/runDynamicCommand';
import { DynamicRepository } from '../src/engine/dynamicRepository';
import type { DomainManifest } from '../src/domain/manifest';

/**
 * Checkpoint final de la Fase 13 (regla 63/70): el flujo COMPLETO --
 * DynamicCommand -> CommandValidator -> CommandExecutor -> DynamicRepository
 * -> DynamicApiClient -> Spring Boot generado -> PostgreSQL -- contra
 * backends reales, compilados y corriendo, no contra mocks. Prueba dos
 * dominios completamente distintos (Ventas y Clínica) con el MISMO build,
 * MISMO Validator, MISMO Executor, sin recompilar nada entre medio (regla
 * 31/64), y una relación requerida real (Consulta -> Paciente/Medico).
 */
describe('Fase 13 — motor dinámico de operaciones, contra backends reales', () => {
  it('Ventas: CREATE, LIST, GET, UPDATE, DELETE de Cliente + relación opcional en Pedido', async () => {
    const backend = await startGeneratedBackend(coreCrudAndOneToManyRelationalModel(), '/api/clientes', undefined, buildCoreCrudAndOneToManyModel());
    try {
      const manifestResult = await loadManifest(backend.baseUrl);
      expect(manifestResult.ok).toBe(true);
      if (!manifestResult.ok) return;
      const manifest: DomainManifest = manifestResult.manifest;
      const repository = new DynamicRepository(backend.baseUrl);

      // CREATE inválido (falta "email", requerido): el Validator lo frena antes de tocar la red.
      const invalid = await runDynamicCommand({ action: 'CREATE', entity: 'Cliente', data: { nombre: 'Carlos' } }, manifest, repository);
      expect(invalid.status).toBe('VALIDATION_ERROR');
      expect(invalid.diagnostics?.[0].code).toBe('MISSING_REQUIRED_FIELD');

      // CREATE válido, contra el backend real.
      const created = await runDynamicCommand({ action: 'CREATE', entity: 'Cliente', data: { nombre: 'Carlos', email: 'carlos@test.com' } }, manifest, repository);
      expect(created.status).toBe('SUCCESS');
      const clienteId = (created.data as { entityType: string; values: Record<string, unknown> }).values.id;
      expect(clienteId).toBeTruthy();

      // LIST: Carlos aparece.
      const listed = await runDynamicCommand({ action: 'LIST', entity: 'Cliente' }, manifest, repository);
      expect(listed.status).toBe('SUCCESS');
      const clientes = listed.data as { values: Record<string, unknown> }[];
      expect(clientes.some((c) => c.values.nombre === 'Carlos')).toBe(true);

      // GET por id.
      const fetched = await runDynamicCommand({ action: 'GET', entity: 'Cliente', id: clienteId as number }, manifest, repository);
      expect(fetched.status).toBe('SUCCESS');
      expect((fetched.data as { values: Record<string, unknown> }).values.nombre).toBe('Carlos');

      // UPDATE (PUT real -- mismo Request DTO, exige los mismos campos required que CREATE).
      const updated = await runDynamicCommand(
        { action: 'UPDATE', entity: 'Cliente', id: clienteId as number, data: { nombre: 'Carlos Pérez', email: 'carlos@test.com' } },
        manifest,
        repository,
      );
      expect(updated.status).toBe('SUCCESS');
      expect((updated.data as { values: Record<string, unknown> }).values.nombre).toBe('Carlos Pérez');

      // Relación opcional (Pedido.cliente es 0..1 en el fixture): un Pedido SIN cliente debe poder crearse.
      const pedidoEntity = manifest.entities.find((e) => e.name === 'Pedido')!;
      const clienteRelation = pedidoEntity.relations.find((r) => r.targetEntity === 'Cliente')!;
      expect(clienteRelation.required).toBe(false);

      const pedidoSinCliente = await runDynamicCommand({ action: 'CREATE', entity: 'Pedido', data: { fecha: '2026-09-21', total: 100.5 } }, manifest, repository);
      expect(pedidoSinCliente.status).toBe('SUCCESS');

      // Y un Pedido CON cliente, usando el id real recién creado -- relación por id explícito (regla 27/28).
      const pedidoConCliente = await runDynamicCommand(
        { action: 'CREATE', entity: 'Pedido', data: { fecha: '2026-09-21', total: 250, [clienteRelation.name]: clienteId } },
        manifest,
        repository,
      );
      expect(pedidoConCliente.status).toBe('SUCCESS');
      expect((pedidoConCliente.data as { values: Record<string, unknown> }).values[clienteRelation.name]).toBe(clienteId);

      // DELETE: usa un Cliente NUEVO, sin Pedidos que lo referencien -- el
      // Cliente original ya tiene un Pedido apuntándolo (pedidoConCliente),
      // y borrarlo violaría la FK real (eso da 409/CONFLICT, comportamiento
      // correcto del backend, no lo que este caso quiere probar).
      const throwaway = await runDynamicCommand({ action: 'CREATE', entity: 'Cliente', data: { nombre: 'Descartable', email: 'descartable@test.com' } }, manifest, repository);
      expect(throwaway.status).toBe('SUCCESS');
      const throwawayId = (throwaway.data as { values: Record<string, unknown> }).values.id;

      const deleted = await runDynamicCommand({ action: 'DELETE', entity: 'Cliente', id: throwawayId as number }, manifest, repository);
      expect(deleted.status).toBe('SUCCESS');
      const afterDelete = await runDynamicCommand({ action: 'GET', entity: 'Cliente', id: throwawayId as number }, manifest, repository);
      expect(afterDelete.status).toBe('NOT_FOUND');

      // Y confirma que un DELETE que sí viola una FK real da CONFLICT, no un 500 ni un SUCCESS falso.
      const blockedDelete = await runDynamicCommand({ action: 'DELETE', entity: 'Cliente', id: clienteId as number }, manifest, repository);
      expect(blockedDelete.status).toBe('CONFLICT');
    } finally {
      backend.stop();
    }
  });

  it('Clínica: mismo build, mismo Validator/Executor, dominio completamente distinto, con relaciones REQUERIDAS (Consulta -> Paciente + Medico)', async () => {
    const backend = await startGeneratedBackend(clinicaRelationalModel(), '/api/pacientes', undefined, buildClinicaModel());
    try {
      const manifestResult = await loadManifest(backend.baseUrl);
      expect(manifestResult.ok).toBe(true);
      if (!manifestResult.ok) return;
      const manifest: DomainManifest = manifestResult.manifest;
      const repository = new DynamicRepository(backend.baseUrl);

      const paciente = await runDynamicCommand({ action: 'CREATE', entity: 'Paciente', data: { nombre: 'Ana' } }, manifest, repository);
      expect(paciente.status).toBe('SUCCESS');
      const pacienteId = (paciente.data as { values: Record<string, unknown> }).values.id;

      const medico = await runDynamicCommand({ action: 'CREATE', entity: 'Medico', data: { nombre: 'Dr. Gomez' } }, manifest, repository);
      expect(medico.status).toBe('SUCCESS');
      const medicoId = (medico.data as { values: Record<string, unknown> }).values.id;

      const consultaEntity = manifest.entities.find((e) => e.name === 'Consulta')!;
      const pacienteRelation = consultaEntity.relations.find((r) => r.targetEntity === 'Paciente')!;
      const medicoRelation = consultaEntity.relations.find((r) => r.targetEntity === 'Medico')!;
      expect(pacienteRelation.required).toBe(true);
      expect(medicoRelation.required).toBe(true);

      // Sin la relación requerida: el Validator la rechaza antes de tocar el backend.
      const missingRelation = await runDynamicCommand(
        { action: 'CREATE', entity: 'Consulta', data: { fecha: '2026-09-21', [pacienteRelation.name]: pacienteId } },
        manifest,
        repository,
      );
      expect(missingRelation.status).toBe('VALIDATION_ERROR');
      expect(missingRelation.diagnostics?.some((d) => d.code === 'MISSING_REQUIRED_FIELD' && d.field === medicoRelation.name)).toBe(true);

      // Con ambas relaciones (ids reales, explícitos -- regla 27/28): CREATE real contra Postgres.
      const consulta = await runDynamicCommand(
        {
          action: 'CREATE',
          entity: 'Consulta',
          data: { fecha: '2026-09-21', [pacienteRelation.name]: pacienteId, [medicoRelation.name]: medicoId },
        },
        manifest,
        repository,
      );
      expect(consulta.status).toBe('SUCCESS');

      const listed = await runDynamicCommand({ action: 'LIST', entity: 'Consulta' }, manifest, repository);
      expect(listed.status).toBe('SUCCESS');
      expect((listed.data as unknown[]).length).toBe(1);
    } finally {
      backend.stop();
    }
  });
});
