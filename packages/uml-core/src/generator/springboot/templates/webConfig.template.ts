/**
 * CORS permisivo (encontrado como bug real probando la Fase 12 en el
 * navegador, no un adorno preventivo): el backend generado no tenía
 * ninguna configuración de CORS, así que cualquier cliente que corra en
 * un origen distinto (la app móvil en modo web, un futuro dashboard, la
 * propia herramienta ShareGrams si algún día quisiera pegarle en vivo)
 * queda bloqueado por el navegador aunque el backend responda 200 -- el
 * fetch nunca llega a completarse del lado del cliente. Mismo criterio
 * permisivo que ya usa el backend de la propia herramienta ShareGrams
 * (`apps/api`, `Access-Control-Allow-Origin: *`): este es un backend
 * generado para desarrollo/demo académica, no un despliegue productivo
 * con requisitos de seguridad propios.
 */
export function renderWebConfig(packageName: string): string {
  return `package ${packageName}.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig {

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                    .allowedOriginPatterns("*")
                    .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                    .allowedHeaders("*");
            }
        };
    }
}
`;
}
