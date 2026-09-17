import type { UMLModel } from '@sharegrams/uml-core';
import { resolveToolCall } from './assistant.resolver';

describe('resolveToolCall', () => {
  const baseModel: UMLModel = {
    classes: [
      {
        id: 'c-cliente',
        name: 'Cliente',
        attributes: [{ id: 'a-nombre', name: 'nombre', type: 'String' }],
        position: { x: 0, y: 0 },
      },
      { id: 'c-pedido', name: 'Pedido', attributes: [], position: { x: 200, y: 0 } },
    ],
    relationships: [
      {
        id: 'r1',
        type: 'ASSOCIATION',
        sourceClassId: 'c-cliente',
        targetClassId: 'c-pedido',
        sourceMultiplicity: { lower: 1, upper: 1 },
        targetMultiplicity: { lower: 0, upper: '*' },
      },
    ],
  };

  describe('create_class', () => {
    it('genera un CREATE_CLASS con id nuevo y una posición', () => {
      const result = resolveToolCall(baseModel, 'create_class', { name: 'Factura' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toMatchObject({ type: 'CREATE_CLASS', name: 'Factura' });
      expect((result.command as { classId: string }).classId).toBeTruthy();
    });

    it('rechaza un nombre vacío como invalid_input', () => {
      const result = resolveToolCall(baseModel, 'create_class', { name: '   ' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.reason).toBe('invalid_input');
    });
  });

  describe('rename_class / move_class / delete_class', () => {
    it('resuelve className -> classId sin distinguir mayúsculas', () => {
      const result = resolveToolCall(baseModel, 'rename_class', { className: 'cliente', newName: 'Comprador' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toEqual({ type: 'UPDATE_CLASS', classId: 'c-cliente', name: 'Comprador' });
    });

    it('devuelve not_found si la clase no existe', () => {
      const result = resolveToolCall(baseModel, 'move_class', { className: 'Factura', x: 10, y: 10 });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.reason).toBe('not_found');
    });

    it('delete_class resuelve al id correcto', () => {
      const result = resolveToolCall(baseModel, 'delete_class', { className: 'Pedido' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toEqual({ type: 'DELETE_CLASS', classId: 'c-pedido' });
    });
  });

  describe('add_attribute / update_attribute / delete_attribute', () => {
    it('add_attribute genera un attributeId nuevo', () => {
      const result = resolveToolCall(baseModel, 'add_attribute', {
        className: 'Cliente',
        attributeName: 'correo',
        attributeType: 'String',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toMatchObject({
        type: 'ADD_ATTRIBUTE',
        classId: 'c-cliente',
        name: 'correo',
        attributeType: 'String',
      });
    });

    it('update_attribute pide aclaración si no se indica qué cambiar', () => {
      const result = resolveToolCall(baseModel, 'update_attribute', { className: 'Cliente', attributeName: 'nombre' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.reason).toBe('clarification_needed');
    });

    it('update_attribute conserva el tipo actual si solo cambia el nombre', () => {
      const result = resolveToolCall(baseModel, 'update_attribute', {
        className: 'Cliente',
        attributeName: 'nombre',
        newName: 'nombreCompleto',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toEqual({
        type: 'UPDATE_ATTRIBUTE',
        classId: 'c-cliente',
        attributeId: 'a-nombre',
        name: 'nombreCompleto',
        attributeType: 'String',
      });
    });

    it('delete_attribute devuelve not_found si el atributo no existe en esa clase', () => {
      const result = resolveToolCall(baseModel, 'delete_attribute', { className: 'Cliente', attributeName: 'correo' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.reason).toBe('not_found');
    });
  });

  describe('create_relationship', () => {
    it('crea la relación con ambas multiplicidades resueltas', () => {
      const result = resolveToolCall(baseModel, 'create_relationship', {
        relationshipType: 'ASSOCIATION',
        sourceClassName: 'Cliente',
        targetClassName: 'Pedido',
        sourceMultiplicity: { lower: 1, upper: 1 },
        targetMultiplicity: { lower: 0, upper: '*' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toMatchObject({
        type: 'CREATE_RELATIONSHIP',
        sourceClassId: 'c-cliente',
        targetClassId: 'c-pedido',
        sourceMultiplicity: { lower: 1, upper: 1 },
        targetMultiplicity: { lower: 0, upper: '*' },
      });
    });

    it('pide aclaración si falta multiplicidad y el tipo no es GENERALIZATION', () => {
      const result = resolveToolCall(baseModel, 'create_relationship', {
        relationshipType: 'ASSOCIATION',
        sourceClassName: 'Cliente',
        targetClassName: 'Pedido',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.reason).toBe('clarification_needed');
    });

    it('GENERALIZATION no requiere multiplicidad', () => {
      const result = resolveToolCall(baseModel, 'create_relationship', {
        relationshipType: 'GENERALIZATION',
        sourceClassName: 'Cliente',
        targetClassName: 'Pedido',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('relaciones existentes (roles, delete, multiplicidad)', () => {
    it('set_relationship_roles asigna el rol al extremo correcto sin pisar el otro', () => {
      const modelWithRoles: UMLModel = {
        ...baseModel,
        relationships: [{ ...baseModel.relationships[0], targetRole: 'pedidos' }],
      };

      const result = resolveToolCall(modelWithRoles, 'set_relationship_roles', {
        className: 'Cliente',
        otherClassName: 'Pedido',
        role: 'comprador',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toEqual({
        type: 'UPDATE_RELATIONSHIP',
        relationshipId: 'r1',
        sourceRole: 'comprador',
        targetRole: 'pedidos',
      });
    });

    it('delete_relationship encuentra la relación sin importar el orden de los nombres', () => {
      const result = resolveToolCall(baseModel, 'delete_relationship', {
        firstClassName: 'Pedido',
        secondClassName: 'Cliente',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toEqual({ type: 'DELETE_RELATIONSHIP', relationshipId: 'r1' });
    });

    it('set_multiplicity determina el extremo (source/target) según la clase indicada', () => {
      const result = resolveToolCall(baseModel, 'set_multiplicity', {
        className: 'Pedido',
        otherClassName: 'Cliente',
        multiplicity: { lower: 0, upper: '*' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.command).toEqual({
        type: 'UPDATE_MULTIPLICITY',
        relationshipId: 'r1',
        end: 'target',
        multiplicity: { lower: 0, upper: '*' },
      });
    });

    it('devuelve clarification_needed si hay más de una relación entre las mismas dos clases', () => {
      const modelWithTwoRelationships: UMLModel = {
        ...baseModel,
        relationships: [
          baseModel.relationships[0],
          {
            id: 'r2',
            type: 'AGGREGATION',
            sourceClassId: 'c-pedido',
            targetClassId: 'c-cliente',
            sourceMultiplicity: { lower: 1, upper: 1 },
            targetMultiplicity: { lower: 1, upper: 1 },
          },
        ],
      };

      const result = resolveToolCall(modelWithTwoRelationships, 'delete_relationship', {
        firstClassName: 'Cliente',
        secondClassName: 'Pedido',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.failure.reason).toBe('clarification_needed');
    });
  });
});
