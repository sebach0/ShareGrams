# ShareGrams

Herramienta CASE colaborativa para diseño de datos mediante diagramas de clases UML. Proyecto académico de Software I.

## Estado actual

**Fases 1-4 — estables.** Editor UML (crear/mover/editar clases, atributos, relaciones y multiplicidades), persistencia con proyectos y usuarios, y colaboración en tiempo real vía WebSockets: varios usuarios conectados al mismo diagrama ven los cambios de los demás sin recargar la página, con concurrencia resuelta por bloqueo optimista (versión del diagrama) y roles de colaborador (dueño / Editor / Lector, con invitación, expulsión y cambio de rol en caliente).

**Fase 5 (asistente de IA por texto) — implementada, pendiente de verificación con la API real.** El editor incluye un panel de chat donde se pueden pedir ediciones puntuales en lenguaje natural ("Crear una clase Cliente", "Agregar un atributo correo de tipo String a Cliente"), que se traducen a los mismos `Command` que usa el editor manual — nunca genera un diagrama completo de una descripción. Toda la lógica de traducción está cubierta por tests con el proveedor de IA mockeado, pero todavía no se corrió contra la API real de Anthropic (falta configurar `ANTHROPIC_API_KEY`, ver más abajo).

## Estructura del repositorio

```
packages/
  uml-core/    # Modelo UML canónico, catálogo de comandos y CommandHandler (sin dependencias de framework)
apps/
  api/         # Backend NestJS + Prisma: auth, proyectos, diagramas, colaboración en tiempo real y asistente de IA
  web/         # Editor UML (React + Vite + React Flow + Zustand)
```

Regla de arquitectura: el canvas nunca modifica el modelo directamente. Toda mutación pasa por un `Command` (CREATE_CLASS, MOVE_CLASS, ADD_ATTRIBUTE, CREATE_RELATIONSHIP, UPDATE_MULTIPLICITY, etc.) que `uml-core` valida y aplica. Esta es la misma vía que usan el editor manual, la colaboración en tiempo real y el asistente de IA, y la que van a reutilizar el importador XMI y el generador de Spring Boot en fases posteriores.

## Cómo correr el proyecto

Requisitos: Node.js 20+, PostgreSQL.

```bash
npm install              # instala todas las dependencias del monorepo (workspaces)
```

**Backend** (`apps/api`): copiar `apps/api/.env.example` a `apps/api/.env` y completar `DATABASE_URL` y `JWT_SECRET`. `ANTHROPIC_API_KEY` es opcional: sin ella, el resto de la API funciona normal y el asistente de IA responde que no está configurado.

```bash
npm run prisma:migrate   # aplica las migraciones a la base
npm run dev:api          # levanta el backend en http://localhost:3000
```

**Frontend** (`apps/web`):

```bash
npm run dev:web           # levanta el editor en http://localhost:5173
```

**Tests:**

```bash
npm run test:uml-core   # tests del modelo UML
npm run test:api        # tests del backend (auth, proyectos, diagramas, tiempo real, asistente de IA)
npm run test:web        # tests del store del editor
npm test                # corre los tres
```

## Comandos UML soportados (Fase 1-2)

`CREATE_CLASS`, `UPDATE_CLASS`, `MOVE_CLASS`, `DELETE_CLASS`, `ADD_ATTRIBUTE`, `UPDATE_ATTRIBUTE`, `DELETE_ATTRIBUTE`, `CREATE_RELATIONSHIP`, `UPDATE_RELATIONSHIP`, `DELETE_RELATIONSHIP`, `UPDATE_MULTIPLICITY`.

Tipos de relación soportados: `ASSOCIATION`, `AGGREGATION`, `COMPOSITION`, `GENERALIZATION` (esta última sin multiplicidad). El tipo de una relación es inmutable tras crearla: para cambiarlo, se elimina y se vuelve a crear.
