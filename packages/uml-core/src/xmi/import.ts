import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { generateId } from '../model/factory';
import { parseMultiplicity } from '../model/multiplicity';
import { PRIMITIVE_TYPES } from '../model/types';
import type { Multiplicity, PrimitiveType, RelationshipType } from '../model/types';
import type { Command } from '../commands/types';

/**
 * XMI 2.1 / UML2 (el dialecto que exporta Enterprise Architect cuando se
 * elige esa versión explícitamente -- ver export.ts para la contraparte).
 * No soporta XMI 1.1/UML 1.3 (el otro dialecto que EA puede generar): la
 * estructura es completamente distinta (AssociationEnd con multiplicidad
 * como un solo string, tipos primitivos como clases con tagged values) y
 * hubiera duplicado casi todo este archivo para una segunda variante.
 *
 * Igual que Fase 7 (imagen): no persiste nada. Devuelve un batch de
 * Command[] para que el frontend lo muestre como vista previa antes de
 * aplicarlo con el dispatch normal del editor.
 */

export interface XmiImportResult {
  commands: Command[];
  summary: string;
  warnings: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'packagedElement' || name === 'ownedAttribute' || name === 'ownedEnd',
});

type XmlNode = Record<string, unknown>;

function attr(node: XmlNode, name: string): string | undefined {
  const value = node[`@_${name}`];
  return typeof value === 'string' ? value : undefined;
}

function asArray(value: unknown): XmlNode[] {
  if (Array.isArray(value)) return value as XmlNode[];
  if (value && typeof value === 'object') return [value as XmlNode];
  return [];
}

/** El tipo de un atributo/extremo llega como atributo type="..." (nuestro propio export) o como elemento <type xmi:idref="..."/> (EA). */
function resolveTypeRef(node: XmlNode): string | undefined {
  return attr(node, 'type') ?? attr((node['type'] as XmlNode) ?? {}, 'xmi:idref');
}

function resolveMultiplicity(node: XmlNode): Multiplicity | null {
  const lowerNode = node['lowerValue'] as XmlNode | undefined;
  const upperNode = node['upperValue'] as XmlNode | undefined;
  if (!lowerNode || !upperNode) return null;
  const rawUpper = attr(upperNode, 'value');
  // EA representa "sin límite" como -1 (uml:LiteralUnlimitedNatural), no como "*".
  const normalizedUpper = rawUpper === '-1' ? '*' : rawUpper;
  return parseMultiplicity({ lower: attr(lowerNode, 'value'), upper: normalizedUpper });
}

interface ParsedAttribute {
  name: string;
  typeRef: string | undefined;
}

interface ParsedClass {
  xmiId: string;
  name: string;
  attributes: ParsedAttribute[];
}

interface ParsedAssociationEnd {
  role: string | undefined;
  typeRef: string | undefined;
  aggregation: string;
  multiplicity: Multiplicity | null;
}

interface ParsedAssociation {
  name: string | undefined;
  ends: ParsedAssociationEnd[];
}

interface ParsedGeneralization {
  generalRef: string | undefined;
  specificRef: string | undefined;
}

interface ParseTree {
  classes: ParsedClass[];
  associations: ParsedAssociation[];
  generalizations: ParsedGeneralization[];
  primitiveTypeNamesById: Map<string, string>;
  warnings: string[];
}

function walkPackagedElements(nodes: XmlNode[], tree: ParseTree): void {
  for (const node of nodes) {
    const type = attr(node, 'xmi:type');
    switch (type) {
      case 'uml:Package': {
        walkPackagedElements(asArray(node['packagedElement']), tree);
        break;
      }
      case 'uml:Class': {
        const xmiId = attr(node, 'xmi:id');
        const name = attr(node, 'name')?.trim();
        if (!xmiId || !name) {
          tree.warnings.push('Se ignoró una clase sin id o sin nombre.');
          break;
        }
        const attributes = asArray(node['ownedAttribute']).map((attributeNode) => ({
          name: attr(attributeNode, 'name') ?? '',
          typeRef: resolveTypeRef(attributeNode),
        }));
        tree.classes.push({ xmiId, name, attributes });
        break;
      }
      case 'uml:PrimitiveType': {
        const xmiId = attr(node, 'xmi:id');
        const name = attr(node, 'name');
        if (xmiId && name) tree.primitiveTypeNamesById.set(xmiId, name);
        break;
      }
      case 'uml:Association': {
        const ends = asArray(node['ownedEnd']).map((endNode) => ({
          role: attr(endNode, 'name'),
          typeRef: resolveTypeRef(endNode),
          aggregation: attr(endNode, 'aggregation') ?? 'none',
          multiplicity: resolveMultiplicity(endNode),
        }));
        if (ends.length !== 2) {
          tree.warnings.push('Se ignoró una asociación sin dos extremos reconocibles.');
          break;
        }
        tree.associations.push({ name: attr(node, 'name'), ends });
        break;
      }
      case 'uml:Generalization': {
        tree.generalizations.push({ generalRef: attr(node, 'general'), specificRef: attr(node, 'specific') });
        break;
      }
      default: {
        if (type) tree.warnings.push(`Se ignoró un elemento de tipo "${type}" (no soportado en este import).`);
      }
    }
  }
}

function normalizePrimitiveType(name: string | undefined): PrimitiveType {
  const match = name && PRIMITIVE_TYPES.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return match || 'String';
}

/**
 * Nuestro modelo no distingue "todo"/"parte" salvo por el tipo de
 * relación (ver export.ts): acá se infiere a partir de cuál extremo trae
 * el aggregation kind, sin asumir en qué orden vienen los ownedEnd en el
 * archivo -- distintas herramientas pueden listarlos en cualquier orden.
 */
function pickSourceTarget(ends: ParsedAssociationEnd[]): {
  type: RelationshipType;
  source: ParsedAssociationEnd;
  target: ParsedAssociationEnd;
} {
  const [end0, end1] = ends;
  if (end0.aggregation === 'composite') return { type: 'COMPOSITION', source: end1, target: end0 };
  if (end1.aggregation === 'composite') return { type: 'COMPOSITION', source: end0, target: end1 };
  if (end0.aggregation === 'shared') return { type: 'AGGREGATION', source: end1, target: end0 };
  if (end1.aggregation === 'shared') return { type: 'AGGREGATION', source: end0, target: end1 };
  return { type: 'ASSOCIATION', source: end0, target: end1 };
}

function gridPosition(index: number): { x: number; y: number } {
  return { x: 120 + (index % 4) * 220, y: 120 + Math.floor(index / 4) * 160 };
}

function describeImport(commands: Command[], warnings: string[]): string {
  const classCount = commands.filter((c) => c.type === 'CREATE_CLASS').length;
  const relationshipCount = commands.filter((c) => c.type === 'CREATE_RELATIONSHIP').length;
  const parts = [
    classCount === 0
      ? 'No se reconoció ninguna clase.'
      : `Se importarían ${classCount} clase${classCount === 1 ? '' : 's'} y ${relationshipCount} relaci${relationshipCount === 1 ? 'ón' : 'ones'}.`,
  ];
  if (warnings.length > 0) parts.push(`${warnings.length} advertencia${warnings.length === 1 ? '' : 's'}.`);
  return parts.join(' ');
}

export function importFromXmi(xmiText: string): XmiImportResult {
  const validation = XMLValidator.validate(xmiText);
  if (validation !== true) {
    return { commands: [], summary: `El archivo no es un XML válido: ${validation.err.msg}`, warnings: [] };
  }

  const root = parser.parse(xmiText) as XmlNode;
  const xmiRoot = (root['xmi:XMI'] as XmlNode | undefined) ?? (root['XMI'] as XmlNode | undefined);
  const model = xmiRoot?.['uml:Model'] as XmlNode | undefined;
  if (!model) {
    return {
      commands: [],
      summary: 'No se encontró un uml:Model en el archivo. ¿Es un export en XMI 2.1/UML2?',
      warnings: [],
    };
  }

  const tree: ParseTree = {
    classes: [],
    associations: [],
    generalizations: [],
    primitiveTypeNamesById: new Map(),
    warnings: [],
  };
  walkPackagedElements(asArray(model['packagedElement']), tree);

  const commands: Command[] = [];
  const warnings = [...tree.warnings];
  const classIdByXmiId = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const parsedClass of tree.classes) {
    const normalizedName = parsedClass.name.toLowerCase();
    if (usedNames.has(normalizedName)) {
      warnings.push(`Se ignoró una clase duplicada llamada "${parsedClass.name}".`);
      continue;
    }
    usedNames.add(normalizedName);

    const classId = generateId();
    classIdByXmiId.set(parsedClass.xmiId, classId);
    commands.push({ type: 'CREATE_CLASS', classId, name: parsedClass.name, position: gridPosition(classIdByXmiId.size - 1) });

    for (const attribute of parsedClass.attributes) {
      if (!attribute.name.trim()) continue;
      const typeName = attribute.typeRef ? tree.primitiveTypeNamesById.get(attribute.typeRef) : undefined;
      commands.push({
        type: 'ADD_ATTRIBUTE',
        classId,
        attributeId: generateId(),
        name: attribute.name.trim(),
        attributeType: normalizePrimitiveType(typeName),
      });
    }
  }

  for (const association of tree.associations) {
    const { type, source, target } = pickSourceTarget(association.ends);
    const sourceClassId = source.typeRef ? classIdByXmiId.get(source.typeRef) : undefined;
    const targetClassId = target.typeRef ? classIdByXmiId.get(target.typeRef) : undefined;
    if (!sourceClassId || !targetClassId) {
      warnings.push('Se ignoró una relación que referencia una clase no reconocida.');
      continue;
    }
    if (!source.multiplicity || !target.multiplicity) {
      warnings.push('Se ignoró una relación sin multiplicidad legible en ambos extremos.');
      continue;
    }

    const relationshipId = generateId();
    commands.push({
      type: 'CREATE_RELATIONSHIP',
      relationshipId,
      relationshipType: type,
      sourceClassId,
      targetClassId,
      sourceMultiplicity: source.multiplicity,
      targetMultiplicity: target.multiplicity,
      name: association.name,
    });
    if (source.role || target.role) {
      commands.push({ type: 'UPDATE_RELATIONSHIP', relationshipId, sourceRole: source.role, targetRole: target.role });
    }
  }

  for (const generalization of tree.generalizations) {
    const sourceClassId = generalization.specificRef ? classIdByXmiId.get(generalization.specificRef) : undefined;
    const targetClassId = generalization.generalRef ? classIdByXmiId.get(generalization.generalRef) : undefined;
    if (!sourceClassId || !targetClassId) {
      warnings.push('Se ignoró una generalización que referencia una clase no reconocida.');
      continue;
    }
    commands.push({
      type: 'CREATE_RELATIONSHIP',
      relationshipId: generateId(),
      relationshipType: 'GENERALIZATION',
      sourceClassId,
      targetClassId,
    });
  }

  return { commands, summary: describeImport(commands, warnings), warnings };
}
