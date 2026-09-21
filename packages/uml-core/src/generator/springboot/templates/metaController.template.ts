/**
 * Endpoint de metadata (Fase 12, regla 11-12): GET /api/meta, idéntico en
 * todos los backends generados. NO es una entidad -- no hay
 * MetaRepository ni CRUD, solo lee un recurso estático empaquetado
 * (manifest.json, generado una sola vez al mismo tiempo que el resto del
 * proyecto) y lo devuelve tal cual. Ningún parsing/reflexión en runtime:
 * el Manifest ya salió completo del ManifestGenerator en build-time.
 */
export function renderMetaController(packageName: string): string {
  return `package ${packageName}.controller;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MetaController {

    private final String manifestJson;

    public MetaController() throws IOException {
        this.manifestJson = new String(new ClassPathResource("manifest.json").getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    }

    @GetMapping("/api/meta")
    public ResponseEntity<String> meta() {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(manifestJson);
    }
}
`;
}
