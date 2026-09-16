# ShareGrams

Herramienta CASE colaborativa para diseño de datos mediante diagramas de clases UML. Proyecto académico de Software I.

## Estado actual

**Fase 1 (editor UML manual) — estable.** Editor en memoria (sin persistencia todavía, eso es Fase 3) donde se pueden crear y mover clases, editar su nombre, agregar/editar/eliminar atributos, crear relaciones arrastrando entre clases y editar sus multiplicidades y roles.

## Estructura del repositorio

```
packages/
  uml-core/   # Modelo UML canónico, catálogo de comandos y CommandHandler (sin dependencias de framework)
apps/
  web/        # Editor UML (React + Vite + React Flow + Zustand)
```

Regla de arquitectura: el canvas nunca modifica el modelo directamente. Toda mutación pasa por un `Command` (CREATE_CLASS, MOVE_CLASS, ADD_ATTRIBUTE, CREATE_RELATIONSHIP, UPDATE_MULTIPLICITY, etc.) que `uml-core` valida y aplica. Esto es lo que permitirá reutilizar la misma lógica desde el backend, la IA, el importador XMI y el generador de Spring Boot en fases posteriores.

## Cómo correr el proyecto

Requisitos: Node.js 20+.

```bash
npm install          # instala todas las dependencias del monorepo (workspaces)
npm run dev:web       # levanta el editor en http://localhost:5173
npm run test:uml-core # corre los tests del modelo UML
```

## Comandos UML soportados (Fase 1-2)

`CREATE_CLASS`, `UPDATE_CLASS`, `MOVE_CLASS`, `DELETE_CLASS`, `ADD_ATTRIBUTE`, `UPDATE_ATTRIBUTE`, `DELETE_ATTRIBUTE`, `CREATE_RELATIONSHIP`, `UPDATE_RELATIONSHIP`, `DELETE_RELATIONSHIP`, `UPDATE_MULTIPLICITY`.

Tipos de relación soportados: `ASSOCIATION`, `AGGREGATION`, `COMPOSITION`, `GENERALIZATION` (esta última sin multiplicidad). El tipo de una relación es inmutable tras crearla: para cambiarlo, se elimina y se vuelve a crear.
