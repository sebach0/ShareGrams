import { buildImportCommands } from './image-recognition.resolver';
import type { RecognizedDiagram } from './image-recognition.types';

describe('buildImportCommands', () => {
  it('genera CREATE_CLASS + ADD_ATTRIBUTE por cada clase reconocida', () => {
    const recognized: RecognizedDiagram = {
      classes: [
        { name: 'Cliente', attributes: [{ name: 'nombre', type: 'String' }] },
        { name: 'Pedido', attributes: [] },
      ],
      relationships: [],
    };

    const { commands, warnings } = buildImportCommands(recognized, 0);

    const classCommands = commands.filter((c) => c.type === 'CREATE_CLASS');
    expect(classCommands).toHaveLength(2);
    expect(classCommands.map((c) => (c as { name: string }).name)).toEqual(['Cliente', 'Pedido']);
    expect(commands.filter((c) => c.type === 'ADD_ATTRIBUTE')).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('usa String cuando el tipo de atributo reconocido no es uno de los soportados', () => {
    const recognized: RecognizedDiagram = {
      classes: [{ name: 'Cliente', attributes: [{ name: 'edad', type: 'entero' }] }],
      relationships: [],
    };

    const { commands } = buildImportCommands(recognized, 0);

    const attribute = commands.find((c) => c.type === 'ADD_ATTRIBUTE');
    expect(attribute).toMatchObject({ attributeType: 'String' });
  });

  it('ignora una clase sin nombre y deja un warning', () => {
    const recognized: RecognizedDiagram = {
      classes: [{ name: '', attributes: [] }, { name: 'Pedido', attributes: [] }],
      relationships: [],
    };

    const { commands, warnings } = buildImportCommands(recognized, 0);

    expect(commands.filter((c) => c.type === 'CREATE_CLASS')).toHaveLength(1);
    expect(warnings).toEqual(['Se ignoró una clase sin nombre.']);
  });

  it('ignora una clase con nombre duplicado dentro de la misma imagen', () => {
    const recognized: RecognizedDiagram = {
      classes: [
        { name: 'Cliente', attributes: [] },
        { name: 'cliente', attributes: [] },
      ],
      relationships: [],
    };

    const { commands, warnings } = buildImportCommands(recognized, 0);

    expect(commands.filter((c) => c.type === 'CREATE_CLASS')).toHaveLength(1);
    expect(warnings[0]).toMatch(/duplicada/);
  });

  it('resuelve una relación a los ids generados de las clases nuevas', () => {
    const recognized: RecognizedDiagram = {
      classes: [
        { name: 'Cliente', attributes: [] },
        { name: 'Pedido', attributes: [] },
      ],
      relationships: [
        {
          relationshipType: 'ASSOCIATION',
          sourceClassName: 'Cliente',
          targetClassName: 'Pedido',
          sourceMultiplicity: { lower: 1, upper: 1 },
          targetMultiplicity: { lower: 0, upper: '*' },
        },
      ],
    };

    const { commands, warnings } = buildImportCommands(recognized, 0);

    const clienteId = (commands.find((c) => c.type === 'CREATE_CLASS' && c.name === 'Cliente') as { classId: string }).classId;
    const pedidoId = (commands.find((c) => c.type === 'CREATE_CLASS' && c.name === 'Pedido') as { classId: string }).classId;
    const relationship = commands.find((c) => c.type === 'CREATE_RELATIONSHIP');

    expect(relationship).toMatchObject({
      type: 'CREATE_RELATIONSHIP',
      sourceClassId: clienteId,
      targetClassId: pedidoId,
      sourceMultiplicity: { lower: 1, upper: 1 },
      targetMultiplicity: { lower: 0, upper: '*' },
    });
    expect(warnings).toEqual([]);
  });

  it('ignora una relación que referencia una clase no reconocida', () => {
    const recognized: RecognizedDiagram = {
      classes: [{ name: 'Cliente', attributes: [] }],
      relationships: [
        {
          relationshipType: 'ASSOCIATION',
          sourceClassName: 'Cliente',
          targetClassName: 'Factura',
          sourceMultiplicity: { lower: 1, upper: 1 },
          targetMultiplicity: { lower: 0, upper: '*' },
        },
      ],
    };

    const { commands, warnings } = buildImportCommands(recognized, 0);

    expect(commands.filter((c) => c.type === 'CREATE_RELATIONSHIP')).toHaveLength(0);
    expect(warnings[0]).toMatch(/no se reconocieron ambas clases/);
  });

  it('GENERALIZATION no requiere multiplicidad', () => {
    const recognized: RecognizedDiagram = {
      classes: [
        { name: 'Persona', attributes: [] },
        { name: 'Cliente', attributes: [] },
      ],
      relationships: [{ relationshipType: 'GENERALIZATION', sourceClassName: 'Cliente', targetClassName: 'Persona' }],
    };

    const { commands, warnings } = buildImportCommands(recognized, 0);

    expect(commands.filter((c) => c.type === 'CREATE_RELATIONSHIP')).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it('ignora una relación no-GENERALIZATION sin multiplicidad legible', () => {
    const recognized: RecognizedDiagram = {
      classes: [
        { name: 'Cliente', attributes: [] },
        { name: 'Pedido', attributes: [] },
      ],
      relationships: [{ relationshipType: 'ASSOCIATION', sourceClassName: 'Cliente', targetClassName: 'Pedido' }],
    };

    const { commands, warnings } = buildImportCommands(recognized, 0);

    expect(commands.filter((c) => c.type === 'CREATE_RELATIONSHIP')).toHaveLength(0);
    expect(warnings[0]).toMatch(/multiplicidad/);
  });

  it('ubica las clases nuevas a partir del offset de clases ya existentes en el diagrama', () => {
    const recognized: RecognizedDiagram = {
      classes: [{ name: 'Factura', attributes: [] }],
      relationships: [],
    };

    const { commands } = buildImportCommands(recognized, 4);

    const classCommand = commands.find((c) => c.type === 'CREATE_CLASS') as { position: { x: number; y: number } };
    expect(classCommand.position).toEqual({ x: 120, y: 120 + 160 });
  });
});
