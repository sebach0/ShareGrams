import type { Multiplicity, PrimitiveType, RelationshipType, UMLClass, UMLModel, UMLRelationship } from '../model/types';

/**
 * UMLModel -> XMI 2.1 / UML2, pensado para poder abrirse en Enterprise
 * Architect (Fase 8). No depende de ninguna librería de tipos externa de
 * EA (cuyos ids internos no conocemos): los uml:PrimitiveType que usa el
 * diagrama se declaran acá mismo, autocontenidos.
 *
 * Convenciones propias, documentadas porque nuestro modelo no las fija
 * por sí solo:
 * - Rol/multiplicidad "en X" (ver RelationshipEdge.tsx) -> van en el
 *   extremo cuyo type es la clase X. Eso es estándar UML2, no una
 *   convención nuestra.
 * - Para AGGREGATION/COMPOSITION: sourceClassId es "el todo",
 *   targetClassId es "la parte" (nuestro modelo no distingue esto más
 *   que por el tipo de relación). El aggregation kind se marca en el
 *   extremo de la parte.
 * - Para GENERALIZATION: sourceClassId es el subtipo (specific),
 *   targetClassId el supertipo (general).
 */

const XMI_NAMESPACE = 'http://schema.omg.org/spec/XMI/2.1';
const UML_NAMESPACE = 'http://schema.omg.org/spec/UML/2.1';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlId(prefix: string, id: string): string {
  return `${prefix}_${id}`;
}

function primitiveTypeId(type: PrimitiveType): string {
  return `primitive_${type}`;
}

function renderMultiplicity(multiplicity: Multiplicity | undefined): string {
  if (!multiplicity) return '';
  const upper = multiplicity.upper === '*' ? '*' : String(multiplicity.upper);
  return (
    `<lowerValue xmi:type="uml:LiteralInteger" value="${multiplicity.lower}"/>` +
    `<upperValue xmi:type="uml:LiteralUnlimitedNatural" value="${escapeXml(upper)}"/>`
  );
}

function renderClass(umlClass: UMLClass): string {
  const attributes = umlClass.attributes
    .map(
      (attribute) =>
        `<ownedAttribute xmi:type="uml:Property" xmi:id="${xmlId('attr', attribute.id)}" name="${escapeXml(attribute.name)}" type="${primitiveTypeId(attribute.type)}"/>`,
    )
    .join('');
  return `<packagedElement xmi:type="uml:Class" xmi:id="${xmlId('class', umlClass.id)}" name="${escapeXml(umlClass.name)}">${attributes}</packagedElement>`;
}

function aggregationKindFor(type: RelationshipType, end: 'source' | 'target'): 'none' | 'shared' | 'composite' {
  if (type === 'ASSOCIATION' || type === 'GENERALIZATION') return 'none';
  if (end === 'source') return 'none'; // el "todo" nunca lleva el marcador, lo lleva la "parte"
  return type === 'COMPOSITION' ? 'composite' : 'shared';
}

function renderAssociation(relationship: UMLRelationship): string {
  const assocId = xmlId('assoc', relationship.id);
  const sourceEndId = xmlId('end_source', relationship.id);
  const targetEndId = xmlId('end_target', relationship.id);

  const sourceEnd =
    `<ownedEnd xmi:type="uml:Property" xmi:id="${sourceEndId}" name="${escapeXml(relationship.sourceRole ?? '')}" ` +
    `type="${xmlId('class', relationship.sourceClassId)}" association="${assocId}" aggregation="${aggregationKindFor(relationship.type, 'source')}">` +
    `${renderMultiplicity(relationship.sourceMultiplicity)}</ownedEnd>`;

  const targetEnd =
    `<ownedEnd xmi:type="uml:Property" xmi:id="${targetEndId}" name="${escapeXml(relationship.targetRole ?? '')}" ` +
    `type="${xmlId('class', relationship.targetClassId)}" association="${assocId}" aggregation="${aggregationKindFor(relationship.type, 'target')}">` +
    `${renderMultiplicity(relationship.targetMultiplicity)}</ownedEnd>`;

  const nameAttr = relationship.name ? ` name="${escapeXml(relationship.name)}"` : '';
  return `<packagedElement xmi:type="uml:Association" xmi:id="${assocId}"${nameAttr} memberEnd="${sourceEndId} ${targetEndId}">${sourceEnd}${targetEnd}</packagedElement>`;
}

function renderGeneralization(relationship: UMLRelationship): string {
  return (
    `<packagedElement xmi:type="uml:Generalization" xmi:id="${xmlId('gen', relationship.id)}" ` +
    `general="${xmlId('class', relationship.targetClassId)}" specific="${xmlId('class', relationship.sourceClassId)}"/>`
  );
}

function renderRelationship(relationship: UMLRelationship): string {
  return relationship.type === 'GENERALIZATION' ? renderGeneralization(relationship) : renderAssociation(relationship);
}

function usedPrimitiveTypes(model: UMLModel): PrimitiveType[] {
  const types = new Set<PrimitiveType>();
  for (const umlClass of model.classes) {
    for (const attribute of umlClass.attributes) {
      types.add(attribute.type);
    }
  }
  return [...types];
}

function renderPrimitiveType(type: PrimitiveType): string {
  return `<packagedElement xmi:type="uml:PrimitiveType" xmi:id="${primitiveTypeId(type)}" name="${type}"/>`;
}

export function exportToXmi(model: UMLModel, modelName = 'ShareGrams'): string {
  const classesXml = model.classes.map(renderClass).join('');
  const relationshipsXml = model.relationships.map(renderRelationship).join('');
  const primitiveTypesXml = usedPrimitiveTypes(model).map(renderPrimitiveType).join('');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<xmi:XMI xmi:version="2.1" xmlns:xmi="${XMI_NAMESPACE}" xmlns:uml="${UML_NAMESPACE}">\n` +
    `<uml:Model xmi:type="uml:Model" xmi:id="model_root" name="${escapeXml(modelName)}">` +
    `${classesXml}${relationshipsXml}${primitiveTypesXml}` +
    `</uml:Model>\n` +
    `</xmi:XMI>\n`
  );
}
