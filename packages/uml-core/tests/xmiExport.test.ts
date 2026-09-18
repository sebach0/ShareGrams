import { describe, expect, it } from 'vitest';
import { exportToXmi } from '../src/xmi/export';
import { createEmptyModel } from '../src/model/factory';
import type { UMLModel } from '../src/model/types';

describe('exportToXmi', () => {
  it('genera un documento válido para un modelo vacío', () => {
    const xml = exportToXmi(createEmptyModel());

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmi:version="2.1"');
    expect(xml).toContain('<uml:Model xmi:type="uml:Model"');
  });

  it('declara cada clase con sus atributos, y cada tipo primitivo usado una sola vez', () => {
    const model: UMLModel = {
      classes: [
        {
          id: 'c1',
          name: 'Cliente',
          position: { x: 0, y: 0 },
          attributes: [
            { id: 'a1', name: 'nombre', type: 'String' },
            { id: 'a2', name: 'edad', type: 'Integer' },
          ],
        },
        {
          id: 'c2',
          name: 'Pedido',
          position: { x: 200, y: 0 },
          attributes: [{ id: 'a3', name: 'codigo', type: 'String' }],
        },
      ],
      relationships: [],
    };

    const xml = exportToXmi(model);

    expect(xml).toContain('xmi:id="class_c1" name="Cliente"');
    expect(xml).toContain('xmi:id="attr_a1" name="nombre" type="primitive_String"');
    expect(xml).toContain('xmi:id="attr_a2" name="edad" type="primitive_Integer"');
    expect(xml).toContain('xmi:id="class_c2" name="Pedido"');

    // "String" lo usan dos atributos de clases distintas: se declara una sola vez.
    expect(xml.match(/xmi:id="primitive_String"/g)).toHaveLength(1);
    expect(xml.match(/xmi:id="primitive_Integer"/g)).toHaveLength(1);
  });

  it('exporta una asociación con multiplicidad y rol en cada extremo, coherente con lo que muestra el canvas', () => {
    const model: UMLModel = {
      classes: [
        { id: 'c1', name: 'Cliente', position: { x: 0, y: 0 }, attributes: [] },
        { id: 'c2', name: 'Pedido', position: { x: 200, y: 0 }, attributes: [] },
      ],
      relationships: [
        {
          id: 'r1',
          type: 'ASSOCIATION',
          sourceClassId: 'c1',
          targetClassId: 'c2',
          sourceMultiplicity: { lower: 1, upper: 1 },
          targetMultiplicity: { lower: 0, upper: '*' },
          sourceRole: 'cliente',
          targetRole: 'pedidos',
        },
      ],
    };

    const xml = exportToXmi(model);

    expect(xml).toContain('<packagedElement xmi:type="uml:Association" xmi:id="assoc_r1" memberEnd="end_source_r1 end_target_r1">');
    // Extremo tipado como Cliente: la multiplicidad "en Cliente" (1) y el rol "cliente".
    expect(xml).toMatch(
      /<ownedEnd xmi:type="uml:Property" xmi:id="end_source_r1" name="cliente" type="class_c1"[^>]*aggregation="none">.*value="1".*value="1"/s,
    );
    // Extremo tipado como Pedido: multiplicidad "en Pedido" (0..*) y el rol "pedidos".
    expect(xml).toMatch(
      /<ownedEnd xmi:type="uml:Property" xmi:id="end_target_r1" name="pedidos" type="class_c2"[^>]*aggregation="none">.*value="0".*value="\*"/s,
    );
  });

  it('incluye el name de la asociación cuando está presente (dato UML real, ej. "Pertenece")', () => {
    const model: UMLModel = {
      classes: [
        { id: 'c1', name: 'Alumno', position: { x: 0, y: 0 }, attributes: [] },
        { id: 'c2', name: 'Colegio', position: { x: 200, y: 0 }, attributes: [] },
      ],
      relationships: [
        {
          id: 'r1',
          type: 'ASSOCIATION',
          sourceClassId: 'c1',
          targetClassId: 'c2',
          sourceMultiplicity: { lower: 1, upper: 1 },
          targetMultiplicity: { lower: 0, upper: '*' },
          name: 'Pertenece',
        },
      ],
    };

    const xml = exportToXmi(model);

    expect(xml).toContain('<packagedElement xmi:type="uml:Association" xmi:id="assoc_r1" name="Pertenece" memberEnd=');
  });

  it('marca aggregation="composite" solo en el extremo de la parte (targetClassId) para COMPOSITION', () => {
    const model: UMLModel = {
      classes: [
        { id: 'c1', name: 'Pedido', position: { x: 0, y: 0 }, attributes: [] },
        { id: 'c2', name: 'LineaPedido', position: { x: 200, y: 0 }, attributes: [] },
      ],
      relationships: [
        {
          id: 'r1',
          type: 'COMPOSITION',
          sourceClassId: 'c1',
          targetClassId: 'c2',
          sourceMultiplicity: { lower: 1, upper: 1 },
          targetMultiplicity: { lower: 1, upper: '*' },
        },
      ],
    };

    const xml = exportToXmi(model);

    expect(xml).toMatch(/xmi:id="end_source_r1"[^>]*aggregation="none"/);
    expect(xml).toMatch(/xmi:id="end_target_r1"[^>]*aggregation="composite"/);
  });

  it('marca aggregation="shared" para AGGREGATION', () => {
    const model: UMLModel = {
      classes: [
        { id: 'c1', name: 'Equipo', position: { x: 0, y: 0 }, attributes: [] },
        { id: 'c2', name: 'Jugador', position: { x: 200, y: 0 }, attributes: [] },
      ],
      relationships: [
        {
          id: 'r1',
          type: 'AGGREGATION',
          sourceClassId: 'c1',
          targetClassId: 'c2',
          sourceMultiplicity: { lower: 1, upper: 1 },
          targetMultiplicity: { lower: 0, upper: '*' },
        },
      ],
    };

    const xml = exportToXmi(model);

    expect(xml).toMatch(/xmi:id="end_target_r1"[^>]*aggregation="shared"/);
  });

  it('exporta GENERALIZATION con specific=source y general=target, sin ownedEnd ni multiplicidad', () => {
    const model: UMLModel = {
      classes: [
        { id: 'c1', name: 'Cliente', position: { x: 0, y: 0 }, attributes: [] },
        { id: 'c2', name: 'Persona', position: { x: 200, y: 0 }, attributes: [] },
      ],
      relationships: [{ id: 'r1', type: 'GENERALIZATION', sourceClassId: 'c1', targetClassId: 'c2' }],
    };

    const xml = exportToXmi(model);

    expect(xml).toContain(
      '<packagedElement xmi:type="uml:Generalization" xmi:id="gen_r1" general="class_c2" specific="class_c1"/>',
    );
    expect(xml).not.toContain('ownedEnd');
  });

  it('escapa caracteres especiales en nombres', () => {
    const model: UMLModel = {
      classes: [{ id: 'c1', name: 'Cliente & Co <VIP>', position: { x: 0, y: 0 }, attributes: [] }],
      relationships: [],
    };

    const xml = exportToXmi(model);

    expect(xml).toContain('Cliente &amp; Co &lt;VIP&gt;');
    expect(xml).not.toContain('Cliente & Co <VIP>');
  });
});
