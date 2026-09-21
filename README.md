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

**Fase 9 (modelo UML → modelo relacional) — implementada y testeada.** Transformador puro y determinista en `packages/uml-core/src/relational/` (`transformUmlToRelational`): sin dependencias de framework, sin tocar HTTP/React. Convierte el `UMLModel` canónico en un `RelationalModel` explícito (tablas, columnas, PK simples/compuestas, FK, constraints UNIQUE), resolviendo 1:1, 1:N y N:M a partir de las multiplicidades, y herencia (GENERALIZATION) con estrategia JOINED. Requirió un único cambio aditivo al modelo canónico: `UMLAttribute.isPrimaryKey?`. Limitaciones documentadas: no soporta todavía `Enumeration` ni `AssociationClass` (el modelo UML no los tiene), ni multiplicidades acotadas exactas (ej. `2..5`).

**Fase 10 (generador de backend Spring Boot) — implementada, testeada, y el backend generado COMPILA de verdad.** Nuevo módulo `packages/uml-core/src/generator/springboot/`, que consume exclusivamente el `RelationalModel` de la Fase 9 (nunca vuelve a interpretar el UML). Genera un proyecto Maven/Spring Boot 3.5.16 (Java 17) completo: entidades JPA, repositorios, servicios (`@Transactional`), controladores REST, DTOs planos (para evitar ciclos de serialización sin `@JsonIgnore` disperso — incluye las colecciones `@ManyToMany`, expuestas como `Set<Long>` de ids), manejo de errores (404 explícito y 409 ante violación de constraints, vía `GlobalExceptionHandler`), Bean Validation, configuración PostgreSQL por variables de entorno (puerto también configurable, `SERVER_PORT`), Swagger/OpenAPI y README. Soporta PK simple (`@GeneratedValue(IDENTITY)`), PK compuesta (`@EmbeddedId` + `@MapsId`), relaciones `@ManyToOne`/`@OneToOne`/`@ManyToMany` derivadas directamente de la metadata de la Fase 9, y herencia JOINED (`@Inheritance`/`@PrimaryKeyJoinColumn`). Limitación documentada: las tablas asociativas con atributos propios (join table con columnas extra, hoy no producible por la Fase 9) generan Entity + Repository completos, pero el Service/Controller de esos casos solo exponen listar y crear (no hay todavía una convención de URL para PK compuesta en el path).

**Fase 11 (verificación integral del backend generado) — implementada; demuestra con ejecución real que el backend generado funciona.** Nueva infraestructura de pruebas E2E en `packages/uml-core/e2e/` (`npm run test:e2e` dentro de `packages/uml-core`, separada de la suite rápida): por cada fixture, genera un backend real, lo escribe a disco, lo compila y empaqueta con Maven, crea una base PostgreSQL aislada y descartable (no hay Docker/Testcontainers en este entorno — se documentó como adaptación, usando el PostgreSQL local real de la app, nunca H2), arranca el jar en un puerto libre, espera a que responda de verdad por HTTP, ejecuta un escenario CRUD/relacional completo contra la API, y limpia todo (proceso, base, directorio temporal) pase o falle el test. 5 fixtures (CRUD+1:N+nullable+errores+JSON, 1:1 con UNIQUE real, N:M, entidad asociativa con PK compuesta, los 8 tipos de dato soportados) + 27 tests, todos verdes. Este proceso encontró y corrigió 4 bugs reales de la Fase 10 (nunca detectados por los tests unitarios, que solo comprobaban el string generado, no la ejecución real): faltaba `@Transactional` en el Service (una colección `@ManyToMany` reemplazada en una entidad *detached* no se sincronizaba con la base), faltaban los imports `JoinColumn`/`Producto` en dos casos donde otro import "de suerte" los tapaba, y el `GlobalExceptionHandler` no manejaba violaciones de constraint de base de datos (devolvía 500 en vez de 409 ante un duplicado de UNIQUE o de PK compuesta).

**Fase 12 (descubrimiento dinámico del backend) — implementada.** Objetivo: la app móvil no puede conocer de antemano qué entidades tiene un backend generado (Ventas ≠ Clínica ≠ Biblioteca). Se evaluó primero si el OpenAPI que ya genera Fase 10 alcanzaba — no: confirmado contra un backend real corriendo, `PedidoResponse.clienteId` aparece como `integer` sin ninguna marca de que es una FK, su cardinalidad, ni cuál campo es la PK. Se agregó un **Domain Manifest** versionado (`packages/uml-core/src/generator/manifest/`, `generateDomainManifest`), generado automáticamente a partir de `UMLModel` + `RelationalModel` (nunca a mano, nunca parseando el Java generado) y servido por todo backend generado en `GET /api/meta` (infraestructura de solo lectura, no una entidad — sin Repository/Service). El Manifest describe entidades, campos, tipos normalizados, PK, relaciones con cardinalidad explícita y operaciones realmente expuestas. Nueva app **`apps/mobile`** (React Native + Expo, TypeScript): pantalla de conexión (URL del backend) + pantalla de discovery (lista lo que encontró), sin CRUD ni formularios todavía (eso es Fase 13). Importa los tipos del Manifest directamente de `@sharegrams/uml-core` (sin duplicar el contrato). Prueba de aceptación real: el mismo mecanismo de descubrimiento (`GET /api/meta` + validación) descubre un backend de Ventas (Cliente, Pedido) y, sin recompilar nada, un backend de Clínica completamente distinto (Paciente, Médico, Consulta) — ambos compilados y corriendo de verdad. Limitación honesta: no hay emulador Android/navegador headless en este entorno de desarrollo, así que la confirmación visual en la UI de la app queda pendiente de una corrida manual; el mecanismo de descubrimiento en sí está probado de punta a punta contra backends reales.

**Fase 13 (motor dinámico de operaciones) — implementada.** Objetivo: que la app móvil pueda ejecutar CRUD sobre cualquier entidad descubierta por la Fase 12 sin un `Repository`/`Service` por entidad. Nuevo motor en `apps/mobile/src/engine/`: `DynamicCommand` (acciones cerradas `LIST|GET|SEARCH|CREATE|UPDATE|DELETE|COUNT`, sin propiedades ajenas como `url`/`sql`/`shell`) → `CommandValidator` (valida entidad/operación permitida/campos/required/tipos/enum/relaciones **exclusivamente contra el Domain Manifest** del backend conectado, nunca hardcodeado por nombre de entidad) → `CommandExecutor` → `DynamicRepository` (arma la URL desde `entity.endpoint`) → `DynamicApiClient` (HTTP+JSON genérico). `runDynamicCommand()` es el único punto de entrada (Validator siempre antes que Executor) — mismo punto que usará el asistente de IA en una fase futura, que **todavía no se toca acá**. Hallazgo real durante el diagnóstico: Fase 10 reusa el mismo Request DTO (mismas `@NotNull`/`@NotBlank`) en `POST` y `PUT`, así que `UPDATE` exige los mismos campos `required` que `CREATE` — no hay PATCH real, el Validator respeta ese contrato en vez de inventar semántica de actualización parcial. `SEARCH`/`COUNT` no existen como endpoints en el backend generado: resueltos como `LIST` + filtro/conteo en memoria, documentado como límite de este MVP (no escalable), encapsulado en el Repository. Las pantallas de la app (`EntityCreateScreen`/`EntityRecordsScreen`) ahora pasan por este motor en vez de llamar `fetch` directo; se sumó una pantalla de desarrollo (`CommandConsoleScreen`, explícitamente no es la UI final) para correr un `DynamicCommand` escrito a mano. Verificado con dos tests E2E reales (`apps/mobile/e2e/`, `npm run test:e2e` dentro de `apps/mobile`, reutiliza la infraestructura de Fase 11): Ventas (Cliente/Pedido — CRUD completo, relación opcional, y un `DELETE` bloqueado por una FK real devolviendo `CONFLICT`, no 500) y Clínica (Paciente/Médico/Consulta — mismo build sin recompilar, relaciones **requeridas** Consulta→Paciente+Medico validadas y persistidas de verdad).

## Estructura del repositorio

```
packages/
  uml-core/    # Modelo UML canónico, catálogo de comandos y CommandHandler (sin dependencias de framework)
apps/
  api/         # Backend NestJS + Prisma: auth, proyectos, diagramas, colaboración en tiempo real y asistente de IA
  web/         # Editor UML (React + Vite + React Flow + Zustand)
  mobile/      # App de descubrimiento (Fase 12) + motor dinámico de operaciones CRUD (Fase 13) contra el backend generado (React Native + Expo)
```

Regla de arquitectura: el canvas nunca modifica el modelo directamente. Toda mutación pasa por un `Command` (CREATE_CLASS, MOVE_CLASS, ADD_ATTRIBUTE, CREATE_RELATIONSHIP, UPDATE_MULTIPLICITY, etc.) que `uml-core` valida y aplica. Esta es la misma vía que usan el editor manual, la colaboración en tiempo real, el asistente de IA y el importador de imagen/XMI (que arman un batch de comandos y lo aplican con el mismo dispatch, tras una vista previa), y la que va a reutilizar el generador de Spring Boot en fases posteriores.

## Despliegue en AWS

Runbook completo (EC2 + RDS, sin Docker) en [`infra/aws/README.md`](infra/aws/README.md).

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
