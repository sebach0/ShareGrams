# ShareGrams

Herramienta CASE colaborativa para diseño de datos mediante diagramas de clases UML. Proyecto académico de Software I.

## Estado actual

**Fases 1-4 — estables.** Editor UML (crear/mover/editar clases, atributos, relaciones y multiplicidades), persistencia con proyectos y usuarios, y colaboración en tiempo real vía WebSockets: varios usuarios conectados al mismo diagrama ven los cambios de los demás sin recargar la página, con concurrencia resuelta por bloqueo optimista (versión del diagrama) y roles de colaborador (dueño / Editor / Lector, con invitación, expulsión y cambio de rol en caliente).

**Fases 5-7 (IA: texto, voz, imagen) — implementadas, pendientes de verificación con la API real.** El editor incluye:
- un panel de chat para pedir ediciones puntuales en lenguaje natural ("Crear una clase Cliente", "Agregar un atributo correo de tipo String a Cliente"), que se traducen a los mismos `Command` que usa el editor manual — nunca genera un diagrama completo de una descripción;
- un botón de micrófono que dicta esa misma instrucción por voz (Web Speech API del navegador, sin motor de voz propio: solo llena el input de texto, el usuario revisa y manda);
- un botón "Importar imagen" que reconoce un diagrama de clases a partir de una foto o captura y arma una vista previa (clases, atributos, relaciones) para confirmar antes de aplicar nada al diagrama real.

Toda la lógica de traducción/resolución está cubierta por tests con el proveedor de IA mockeado, pero ninguna de las tres todavía se corrió contra la API real de Anthropic (falta configurar `ANTHROPIC_API_KEY`, ver más abajo).

**Fase 8 (XMI / interoperabilidad con Enterprise Architect) — implementada y verificada de punta a punta.** A diferencia de las fases de IA, esta no depende de ningún servicio externo: es conversión de formato pura, 100% en el navegador (`packages/uml-core`, sin tocar el backend). Los botones "⬇ Exportar XMI" y "📄 Importar XMI" del editor exportan/leen XMI 2.1 (UML2). El export se probó exportando un diagrama real y abriéndolo en Enterprise Architect; el import se probó contra un archivo exportado desde EA real, incluido tal cual como fixture de test (`packages/uml-core/tests/xmiImport.test.ts`). Solo soporta XMI 2.1/UML2 (el dialecto que exporta EA cuando se elige esa versión explícitamente) — no el XMI 1.1/UML 1.3 legado, que es una estructura completamente distinta.

## Estructura del repositorio

```
packages/
  uml-core/    # Modelo UML canónico, catálogo de comandos y CommandHandler (sin dependencias de framework)
apps/
  api/         # Backend NestJS + Prisma: auth, proyectos, diagramas, colaboración en tiempo real y asistente de IA
  web/         # Editor UML (React + Vite + React Flow + Zustand)
```

Regla de arquitectura: el canvas nunca modifica el modelo directamente. Toda mutación pasa por un `Command` (CREATE_CLASS, MOVE_CLASS, ADD_ATTRIBUTE, CREATE_RELATIONSHIP, UPDATE_MULTIPLICITY, etc.) que `uml-core` valida y aplica. Esta es la misma vía que usan el editor manual, la colaboración en tiempo real, el asistente de IA y el importador de imagen/XMI (que arman un batch de comandos y lo aplican con el mismo dispatch, tras una vista previa), y la que va a reutilizar el generador de Spring Boot en fases posteriores.

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
npm run test:uml-core   # tests del modelo UML, export/import XMI
npm run test:api        # tests del backend (auth, proyectos, diagramas, tiempo real, asistente de IA, reconocimiento de imagen)
npm run test:web        # tests del store del editor
npm test                # corre los tres
```

## Comandos UML soportados (Fase 1-2)

`CREATE_CLASS`, `UPDATE_CLASS`, `MOVE_CLASS`, `DELETE_CLASS`, `ADD_ATTRIBUTE`, `UPDATE_ATTRIBUTE`, `DELETE_ATTRIBUTE`, `CREATE_RELATIONSHIP`, `UPDATE_RELATIONSHIP`, `DELETE_RELATIONSHIP`, `UPDATE_MULTIPLICITY`.

Tipos de relación soportados: `ASSOCIATION`, `AGGREGATION`, `COMPOSITION`, `GENERALIZATION` (esta última sin multiplicidad). El tipo de una relación es inmutable tras crearla: para cambiarlo, se elimina y se vuelve a crear.
