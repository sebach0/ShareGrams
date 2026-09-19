import type { SpringBootGenerationOptions } from '../types';

export function renderReadme(options: SpringBootGenerationOptions): string {
  return `# ${options.projectName}

Backend generado automáticamente por ShareGrams a partir de un modelo UML (Fase 10: RelationalModel → proyecto Spring Boot).

## Requisitos

- Java 17+
- Maven 3.9+
- PostgreSQL (o Docker para levantarlo localmente)

## Variables de entorno

| Variable      | Default                                              |
|---------------|-------------------------------------------------------|
| \`DB_URL\`      | \`jdbc:postgresql://localhost:5432/${options.databaseName}\` |
| \`DB_USER\`     | \`postgres\`                                           |
| \`DB_PASSWORD\` | \`postgres\`                                           |

## Ejecución

\`\`\`bash
mvn spring-boot:run
\`\`\`

## Compilar / testear

\`\`\`bash
mvn clean verify
\`\`\`

## Swagger / OpenAPI

Con la aplicación corriendo: http://localhost:8080/swagger-ui.html
`;
}
