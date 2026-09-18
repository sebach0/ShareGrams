import type { UMLModel } from '../model/types';
import type { Command, CommandResult } from '../commands/types';
import { createClass, updateClass, moveClass, deleteClass } from './reducers/classReducers';
import { addAttribute, updateAttribute, deleteAttribute } from './reducers/attributeReducers';
import {
  createRelationship,
  updateRelationship,
  updateRelationshipLayout,
  deleteRelationship,
  updateMultiplicity,
} from './reducers/relationshipReducers';

/**
 * Único punto de entrada para mutar un UMLModel. Es puro (no persiste, no
 * emite eventos): eso lo deciden los llamadores (store del editor, gateway
 * de colaboración, intérprete de IA, importador XMI), todos reutilizando
 * esta misma función para no divergir en las reglas del modelo.
 */
export function applyCommand(model: UMLModel, command: Command): CommandResult {
  switch (command.type) {
    case 'CREATE_CLASS':
      return createClass(model, command);
    case 'UPDATE_CLASS':
      return updateClass(model, command);
    case 'MOVE_CLASS':
      return moveClass(model, command);
    case 'DELETE_CLASS':
      return deleteClass(model, command);
    case 'ADD_ATTRIBUTE':
      return addAttribute(model, command);
    case 'UPDATE_ATTRIBUTE':
      return updateAttribute(model, command);
    case 'DELETE_ATTRIBUTE':
      return deleteAttribute(model, command);
    case 'CREATE_RELATIONSHIP':
      return createRelationship(model, command);
    case 'UPDATE_RELATIONSHIP':
      return updateRelationship(model, command);
    case 'UPDATE_RELATIONSHIP_LAYOUT':
      return updateRelationshipLayout(model, command);
    case 'DELETE_RELATIONSHIP':
      return deleteRelationship(model, command);
    case 'UPDATE_MULTIPLICITY':
      return updateMultiplicity(model, command);
  }
}
