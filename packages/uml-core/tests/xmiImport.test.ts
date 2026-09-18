import { describe, expect, it } from 'vitest';
import { importFromXmi } from '../src/xmi/import';
import { exportToXmi } from '../src/xmi/export';
import { applyCommand } from '../src/engine/CommandHandler';
import { createEmptyModel } from '../src/model/factory';
import type { UMLModel } from '../src/model/types';

/** Aplica un batch de comandos en orden sobre un modelo vacío, como haría el dispatch real del editor. */
function applyAll(model: UMLModel, commands: ReturnType<typeof importFromXmi>['commands']): UMLModel {
  let current = model;
  for (const command of commands) {
    const result = applyCommand(current, command);
    if (!result.ok) throw new Error(`Comando rechazado: ${result.error.code} ${result.error.message}`);
    current = result.model;
  }
  return current;
}

describe('importFromXmi', () => {
  it('rechaza un archivo que no es XML válido', () => {
    const result = importFromXmi('esto no es xml <<<');
    expect(result.commands).toEqual([]);
    expect(result.summary).toMatch(/no es un XML válido/);
  });

  it('rechaza un archivo XML válido pero sin uml:Model', () => {
    const result = importFromXmi('<root><algo/></root>');
    expect(result.commands).toEqual([]);
    expect(result.summary).toMatch(/uml:Model/);
  });

  it('importa una clase con atributos usando el estilo de referencia por atributo (nuestro propio export)', () => {
    const xml = `<?xml version="1.0"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" xmi:id="m" name="M">
<packagedElement xmi:type="uml:Class" xmi:id="c1" name="Cliente">
<ownedAttribute xmi:type="uml:Property" xmi:id="a1" name="nombre" type="p_String"/>
</packagedElement>
<packagedElement xmi:type="uml:PrimitiveType" xmi:id="p_String" name="String"/>
</uml:Model>
</xmi:XMI>`;

    const result = importFromXmi(xml);

    expect(result.commands.filter((c) => c.type === 'CREATE_CLASS')).toHaveLength(1);
    const attributeCommand = result.commands.find((c) => c.type === 'ADD_ATTRIBUTE');
    expect(attributeCommand).toMatchObject({ name: 'nombre', attributeType: 'String' });
    expect(result.warnings).toEqual([]);
  });

  it('importa el estilo de EA: <type xmi:idref="..."/> como elemento hijo en vez de atributo', () => {
    const xml = `<?xml version="1.0"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" name="M">
<packagedElement xmi:type="uml:Class" xmi:id="c1" name="Cliente">
<ownedAttribute xmi:type="uml:Property" xmi:id="a1" name="edad">
<type xmi:idref="p_Integer"/>
</ownedAttribute>
</packagedElement>
<packagedElement xmi:type="uml:PrimitiveType" xmi:id="p_Integer" name="Integer"/>
</uml:Model>
</xmi:XMI>`;

    const result = importFromXmi(xml);

    const attributeCommand = result.commands.find((c) => c.type === 'ADD_ATTRIBUTE');
    expect(attributeCommand).toMatchObject({ name: 'edad', attributeType: 'Integer' });
  });

  it('importa una asociación con multiplicidad, interpretando -1 como "*" (convención de EA)', () => {
    const xml = `<?xml version="1.0"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" name="M">
<packagedElement xmi:type="uml:Class" xmi:id="c1" name="Cliente"/>
<packagedElement xmi:type="uml:Class" xmi:id="c2" name="Pedido"/>
<packagedElement xmi:type="uml:Association" xmi:id="r1">
<memberEnd xmi:idref="e1"/><memberEnd xmi:idref="e2"/>
<ownedEnd xmi:type="uml:Property" xmi:id="e1" type="c1" aggregation="none">
<lowerValue xmi:type="uml:LiteralInteger" value="1"/>
<upperValue xmi:type="uml:LiteralInteger" value="1"/>
</ownedEnd>
<ownedEnd xmi:type="uml:Property" xmi:id="e2" type="c2" aggregation="none">
<lowerValue xmi:type="uml:LiteralInteger" value="0"/>
<upperValue xmi:type="uml:LiteralUnlimitedNatural" value="-1"/>
</ownedEnd>
</packagedElement>
</uml:Model>
</xmi:XMI>`;

    const result = importFromXmi(xml);

    const relationship = result.commands.find((c) => c.type === 'CREATE_RELATIONSHIP');
    expect(relationship).toMatchObject({
      type: 'CREATE_RELATIONSHIP',
      relationshipType: 'ASSOCIATION',
      sourceMultiplicity: { lower: 1, upper: 1 },
      targetMultiplicity: { lower: 0, upper: '*' },
    });
  });

  it('importa el name de la asociación cuando está presente (dato UML real, ej. "Pertenece")', () => {
    const xml = `<?xml version="1.0"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" name="M">
<packagedElement xmi:type="uml:Class" xmi:id="c1" name="Alumno"/>
<packagedElement xmi:type="uml:Class" xmi:id="c2" name="Colegio"/>
<packagedElement xmi:type="uml:Association" xmi:id="r1" name="Pertenece">
<ownedEnd xmi:type="uml:Property" xmi:id="e1" type="c1" aggregation="none">
<lowerValue xmi:type="uml:LiteralInteger" value="1"/><upperValue xmi:type="uml:LiteralInteger" value="1"/>
</ownedEnd>
<ownedEnd xmi:type="uml:Property" xmi:id="e2" type="c2" aggregation="none">
<lowerValue xmi:type="uml:LiteralInteger" value="0"/><upperValue xmi:type="uml:LiteralUnlimitedNatural" value="-1"/>
</ownedEnd>
</packagedElement>
</uml:Model>
</xmi:XMI>`;

    const result = importFromXmi(xml);

    const relationship = result.commands.find((c) => c.type === 'CREATE_RELATIONSHIP');
    expect(relationship).toMatchObject({ name: 'Pertenece' });
  });

  it('para COMPOSITION, ubica como "todo" (source) al extremo que NO lleva el aggregation kind, sin importar el orden en el archivo', () => {
    const xml = `<?xml version="1.0"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" name="M">
<packagedElement xmi:type="uml:Class" xmi:id="whole" name="Pedido"/>
<packagedElement xmi:type="uml:Class" xmi:id="part" name="LineaPedido"/>
<packagedElement xmi:type="uml:Association" xmi:id="r1">
<ownedEnd xmi:type="uml:Property" xmi:id="e1" type="part" aggregation="composite">
<lowerValue xmi:type="uml:LiteralInteger" value="1"/><upperValue xmi:type="uml:LiteralUnlimitedNatural" value="-1"/>
</ownedEnd>
<ownedEnd xmi:type="uml:Property" xmi:id="e2" type="whole" aggregation="none">
<lowerValue xmi:type="uml:LiteralInteger" value="1"/><upperValue xmi:type="uml:LiteralInteger" value="1"/>
</ownedEnd>
</packagedElement>
</uml:Model>
</xmi:XMI>`;

    const result = importFromXmi(xml);

    const wholeId = (result.commands.find((c) => c.type === 'CREATE_CLASS' && c.name === 'Pedido') as { classId: string }).classId;
    const partId = (result.commands.find((c) => c.type === 'CREATE_CLASS' && c.name === 'LineaPedido') as { classId: string }).classId;
    const relationship = result.commands.find((c) => c.type === 'CREATE_RELATIONSHIP');

    expect(relationship).toMatchObject({ relationshipType: 'COMPOSITION', sourceClassId: wholeId, targetClassId: partId });
  });

  it('importa una generalización con specific=source, general=target', () => {
    const xml = `<?xml version="1.0"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" name="M">
<packagedElement xmi:type="uml:Class" xmi:id="c1" name="Cliente"/>
<packagedElement xmi:type="uml:Class" xmi:id="c2" name="Persona"/>
<packagedElement xmi:type="uml:Generalization" xmi:id="g1" general="c2" specific="c1"/>
</uml:Model>
</xmi:XMI>`;

    const result = importFromXmi(xml);

    const clienteId = (result.commands.find((c) => c.type === 'CREATE_CLASS' && c.name === 'Cliente') as { classId: string }).classId;
    const personaId = (result.commands.find((c) => c.type === 'CREATE_CLASS' && c.name === 'Persona') as { classId: string }).classId;
    const generalization = result.commands.find((c) => c.type === 'CREATE_RELATIONSHIP');

    expect(generalization).toMatchObject({ relationshipType: 'GENERALIZATION', sourceClassId: clienteId, targetClassId: personaId });
  });

  it('ignora una clase duplicada por nombre y lo deja como warning', () => {
    const xml = `<?xml version="1.0"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" name="M">
<packagedElement xmi:type="uml:Class" xmi:id="c1" name="Cliente"/>
<packagedElement xmi:type="uml:Class" xmi:id="c2" name="cliente"/>
</uml:Model>
</xmi:XMI>`;

    const result = importFromXmi(xml);

    expect(result.commands.filter((c) => c.type === 'CREATE_CLASS')).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/duplicada/);
  });

  it('recorre uml:Package anidados (así es como EA envuelve el diagrama)', () => {
    const xml = `<?xml version="1.0"?>
<xmi:XMI xmi:version="2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1">
<uml:Model xmi:type="uml:Model" name="M">
<packagedElement xmi:type="uml:Package" xmi:id="pkg" name="Diagrama principal">
<packagedElement xmi:type="uml:Class" xmi:id="c1" name="Cliente"/>
</packagedElement>
</uml:Model>
</xmi:XMI>`;

    const result = importFromXmi(xml);

    expect(result.commands.filter((c) => c.type === 'CREATE_CLASS')).toHaveLength(1);
  });

  it('round-trip: exportar y reimportar reproduce el mismo modelo (salvo los ids, que se regeneran)', () => {
    const original: UMLModel = {
      classes: [
        {
          id: 'c1',
          name: 'Cliente',
          position: { x: 0, y: 0 },
          attributes: [{ id: 'a1', name: 'nombre', type: 'String' }],
        },
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

    const xml = exportToXmi(original);
    const { commands, warnings } = importFromXmi(xml);
    const rebuilt = applyAll(createEmptyModel(), commands);

    expect(warnings).toEqual([]);
    expect(rebuilt.classes.map((c) => ({ name: c.name, attributes: c.attributes.map((a) => ({ name: a.name, type: a.type })) }))).toEqual(
      original.classes.map((c) => ({ name: c.name, attributes: c.attributes.map((a) => ({ name: a.name, type: a.type })) })),
    );
    expect(
      rebuilt.relationships.map((r) => ({
        type: r.type,
        sourceMultiplicity: r.sourceMultiplicity,
        targetMultiplicity: r.targetMultiplicity,
        sourceRole: r.sourceRole,
        targetRole: r.targetRole,
      })),
    ).toEqual([
      {
        type: 'ASSOCIATION',
        sourceMultiplicity: { lower: 1, upper: 1 },
        targetMultiplicity: { lower: 0, upper: '*' },
        sourceRole: 'cliente',
        targetRole: 'pedidos',
      },
    ]);
  });

  it('importa un export real de Enterprise Architect (XMI 2.1) tal cual, sin recortar', () => {
    // Extracto real de un archivo exportado con EA 2.5 (Fase 8, probado por el usuario contra su propia instalación).
    const realEaExport = `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">
	<xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>
	<uml:Model xmi:type="uml:Model" name="EA_Model" visibility="public">
		<packagedElement xmi:type="uml:Package" xmi:id="EAPK_9F8927D8_51BB_4b34_BDF9_E545ED16D0F1" name="Diagrama principal" visibility="public">
			<packagedElement xmi:type="uml:Class" xmi:id="EAID_5709838A_621A_40bf_8DB7_7C6383C80857" name="Clase_Persona" visibility="public">
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_DD368417_BF20_4f2e_85D5_83B5E3808A3A" name="ID" visibility="public">
					<type xmi:idref="EAID_E1F61144_75A5_4416_949B_BC874002AD82"/>
					<lowerValue xmi:type="uml:LiteralInteger" value="1"/>
					<upperValue xmi:type="uml:LiteralInteger" value="1"/>
				</ownedAttribute>
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_396172E2_96BC_4b3b_810B_2219F3AD16B6" name="Nombre" visibility="public">
					<type xmi:idref="EAID_8DE141D6_D84B_448a_8B0F_C6A73818A719"/>
					<lowerValue xmi:type="uml:LiteralInteger" value="1"/>
					<upperValue xmi:type="uml:LiteralInteger" value="1"/>
				</ownedAttribute>
			</packagedElement>
			<packagedElement xmi:type="uml:Association" xmi:id="EAID_3D3820A0_FFC3_433d_8B99_A51B79159341" visibility="public">
				<memberEnd xmi:idref="EAID_dst3820A0_FFC3_433d_8B99_A51B79159341"/>
				<memberEnd xmi:idref="EAID_src3820A0_FFC3_433d_8B99_A51B79159341"/>
				<ownedEnd xmi:type="uml:Property" xmi:id="EAID_src3820A0_FFC3_433d_8B99_A51B79159341" visibility="public" association="EAID_3D3820A0_FFC3_433d_8B99_A51B79159341" aggregation="none">
					<type xmi:idref="EAID_4B9AC8A4_5FBF_4439_8977_CAC84CEA27DC"/>
					<lowerValue xmi:type="uml:LiteralInteger" value="1"/>
					<upperValue xmi:type="uml:LiteralUnlimitedNatural" value="-1"/>
				</ownedEnd>
				<ownedEnd xmi:type="uml:Property" xmi:id="EAID_dst3820A0_FFC3_433d_8B99_A51B79159341" visibility="public" association="EAID_3D3820A0_FFC3_433d_8B99_A51B79159341" aggregation="none">
					<type xmi:idref="EAID_5709838A_621A_40bf_8DB7_7C6383C80857"/>
					<lowerValue xmi:type="uml:LiteralInteger" value="1"/>
					<upperValue xmi:type="uml:LiteralUnlimitedNatural" value="-1"/>
				</ownedEnd>
			</packagedElement>
			<packagedElement xmi:type="uml:Class" xmi:id="EAID_4B9AC8A4_5FBF_4439_8977_CAC84CEA27DC" name="Universidad" visibility="public">
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_66B73398_BA8F_4b4c_829D_D2366BA296CF" name="ID" visibility="public">
					<type xmi:idref="EAID_E1F61144_75A5_4416_949B_BC874002AD82"/>
					<lowerValue xmi:type="uml:LiteralInteger" value="1"/>
					<upperValue xmi:type="uml:LiteralInteger" value="1"/>
				</ownedAttribute>
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_754B3068_1E0C_4559_9EED_0E5C27E0C736" name="Nombre" visibility="public">
					<type xmi:idref="EAID_8DE141D6_D84B_448a_8B0F_C6A73818A719"/>
					<lowerValue xmi:type="uml:LiteralInteger" value="1"/>
					<upperValue xmi:type="uml:LiteralInteger" value="1"/>
				</ownedAttribute>
				<ownedAttribute xmi:type="uml:Property" xmi:id="EAID_A9D71005_2C99_4cd6_93ED_ABA664482CBF" name="Ubicacion" visibility="public">
					<type xmi:idref="EAID_8DE141D6_D84B_448a_8B0F_C6A73818A719"/>
					<lowerValue xmi:type="uml:LiteralInteger" value="1"/>
					<upperValue xmi:type="uml:LiteralInteger" value="1"/>
				</ownedAttribute>
			</packagedElement>
			<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAID_E1F61144_75A5_4416_949B_BC874002AD82" name="Integer" visibility="public"/>
			<packagedElement xmi:type="uml:PrimitiveType" xmi:id="EAID_8DE141D6_D84B_448a_8B0F_C6A73818A719" name="String" visibility="public"/>
		</packagedElement>
	</uml:Model>
</xmi:XMI>`;

    const { commands, warnings, summary } = importFromXmi(realEaExport);

    expect(warnings).toEqual([]);
    expect(summary).toContain('2 clases');

    const rebuilt = applyAll(createEmptyModel(), commands);
    expect(rebuilt.classes.map((c) => c.name).sort()).toEqual(['Clase_Persona', 'Universidad']);
    expect(rebuilt.classes.find((c) => c.name === 'Universidad')?.attributes.map((a) => `${a.name}:${a.type}`)).toEqual([
      'ID:Integer',
      'Nombre:String',
      'Ubicacion:String',
    ]);
    expect(rebuilt.relationships).toHaveLength(1);
    expect(rebuilt.relationships[0]).toMatchObject({
      type: 'ASSOCIATION',
      sourceMultiplicity: { lower: 1, upper: '*' },
      targetMultiplicity: { lower: 1, upper: '*' },
    });
  });
});
