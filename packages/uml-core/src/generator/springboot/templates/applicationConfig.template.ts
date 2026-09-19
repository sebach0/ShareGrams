/** Config PostgreSQL vía variables de entorno con defaults razonables (regla 20) -- ningún secreto real embebido. Hibernate crea/actualiza el esquema (ddl-auto=update) para el MVP; Flyway/Liquibase queda fuera de esta fase. */
export function renderApplicationProperties(databaseName: string): string {
  return `server.port=\${SERVER_PORT:8080}

spring.datasource.url=\${DB_URL:jdbc:postgresql://localhost:5432/${databaseName}}
spring.datasource.username=\${DB_USER:postgres}
spring.datasource.password=\${DB_PASSWORD:postgres}
spring.datasource.driver-class-name=org.postgresql.Driver

spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.open-in-view=false

springdoc.swagger-ui.path=/swagger-ui.html
`;
}
