import type { JavaEntityModel } from '../context/types';
import { renderImports } from './javaImports';

/**
 * API REST estándar (regla 15): GET lista, GET por id, POST, PUT, DELETE.
 * Ruta = "/api/" + plural determinista de la tabla (naming.routeSegment).
 *
 * Entidades con PK compuesta (ver service.template.ts) solo exponen
 * lista+creación por ahora -- GET/PUT/DELETE por id necesitarían una
 * convención de URL para claves compuestas que todavía no está definida.
 */
export function renderController(packageName: string, entity: JavaEntityModel): string {
  const isEmbedded = entity.primaryKey.kind === 'embedded';
  const idType = entity.idJavaType;

  const imports = new Set<string>([
    `${packageName}.dto.${entity.className}Request`,
    `${packageName}.dto.${entity.className}Response`,
    `${packageName}.service.${entity.className}Service`,
    'jakarta.validation.Valid',
    'java.util.List',
    'org.springframework.http.HttpStatus',
    'org.springframework.web.bind.annotation.GetMapping',
    'org.springframework.web.bind.annotation.PostMapping',
    'org.springframework.web.bind.annotation.RequestBody',
    'org.springframework.web.bind.annotation.RequestMapping',
    'org.springframework.web.bind.annotation.ResponseStatus',
    'org.springframework.web.bind.annotation.RestController',
  ]);
  if (!isEmbedded) {
    imports.add('org.springframework.web.bind.annotation.PathVariable');
    imports.add('org.springframework.web.bind.annotation.PutMapping');
    imports.add('org.springframework.web.bind.annotation.DeleteMapping');
  }

  const methods = [
    `    @GetMapping
    public List<${entity.className}Response> findAll() {
        return service.findAll();
    }`,
    `    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ${entity.className}Response create(@Valid @RequestBody ${entity.className}Request request) {
        return service.create(request);
    }`,
  ];

  if (!isEmbedded) {
    methods.splice(
      1,
      0,
      `    @GetMapping("/{id}")
    public ${entity.className}Response findById(@PathVariable ${idType} id) {
        return service.findById(id);
    }`,
    );
    methods.push(
      `    @PutMapping("/{id}")
    public ${entity.className}Response update(@PathVariable ${idType} id, @Valid @RequestBody ${entity.className}Request request) {
        return service.update(id, request);
    }`,
      `    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable ${idType} id) {
        service.delete(id);
    }`,
    );
  }

  return `package ${packageName}.controller;

${renderImports(imports)}

@RestController
@RequestMapping("/api/${entity.routeSegment}")
public class ${entity.className}Controller {

    private final ${entity.className}Service service;

    public ${entity.className}Controller(${entity.className}Service service) {
        this.service = service;
    }

${methods.join('\n\n')}
}
`;
}
