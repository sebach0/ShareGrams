import { describe, expect, it } from 'vitest';
import { generateSpringBootProject } from '../../../src/generator/springboot/projectGenerator';
import { DEFAULT_GENERATION_OPTIONS } from '../../../src/generator/springboot/types';
import type { GenerateProjectResult } from '../../../src/generator/springboot/projectGenerator';
import type { RelationalModel, RelationalTable } from '../../../src/relational/types';

function expectOk(result: GenerateProjectResult) {
  if (!result.ok) {
    throw new Error(`Se esperaba éxito, hubo errores: ${result.errors.map((e) => `${e.code}: ${e.message}`).join(' | ')}`);
  }
  return result.project;
}

function expectFail(result: GenerateProjectResult, code: string) {
  if (result.ok) throw new Error('Se esperaba un error, la generación tuvo éxito');
  expect(result.errors.map((e) => e.code)).toContain(code);
}

function findFile(project: ReturnType<typeof expectOk>, path: string) {
  const found = project.files.find((f) => f.path === path);
  if (!found) throw new Error(`No se encontró el archivo "${path}" (archivos: ${project.files.map((f) => f.path).join(', ')})`);
  return found;
}

const clienteTable: RelationalTable = {
  id: 'cliente',
  name: 'cliente',
  columns: [
    { id: 'c-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'c', attributeId: 'c-id' } },
    { id: 'c-nombre', name: 'nombre', type: 'VARCHAR', nullable: false, origin: { kind: 'attribute', classId: 'c', attributeId: 'c-nombre' } },
    { id: 'c-email', name: 'email', type: 'VARCHAR', nullable: true, origin: { kind: 'attribute', classId: 'c', attributeId: 'c-email' } },
  ],
  primaryKey: { columns: ['id'] },
  foreignKeys: [],
  uniqueConstraints: [],
  origin: { kind: 'class', classId: 'c' },
};

const pedidoTable: RelationalTable = {
  id: 'pedido',
  name: 'pedido',
  columns: [
    { id: 'p-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'p', attributeId: 'p-id' } },
    { id: 'p-fecha', name: 'fecha', type: 'DATE', nullable: false, origin: { kind: 'attribute', classId: 'p', attributeId: 'p-fecha' } },
    { id: 'p-total', name: 'total', type: 'NUMERIC', nullable: false, origin: { kind: 'attribute', classId: 'p', attributeId: 'p-total' } },
    { id: 'r1:fk', name: 'cliente_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r1', end: 'target' } },
  ],
  primaryKey: { columns: ['id'] },
  foreignKeys: [{ id: 'r1:fk', columns: ['cliente_id'], referencedTable: 'cliente', referencedColumns: ['id'] }],
  uniqueConstraints: [],
  origin: { kind: 'class', classId: 'p' },
};

const productoTable: RelationalTable = {
  id: 'producto',
  name: 'producto',
  columns: [
    { id: 'pr-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'pr', attributeId: 'pr-id' } },
    { id: 'pr-nombre', name: 'nombre', type: 'VARCHAR', nullable: false, origin: { kind: 'attribute', classId: 'pr', attributeId: 'pr-nombre' } },
    { id: 'pr-precio', name: 'precio', type: 'NUMERIC', nullable: false, origin: { kind: 'attribute', classId: 'pr', attributeId: 'pr-precio' } },
  ],
  primaryKey: { columns: ['id'] },
  foreignKeys: [],
  uniqueConstraints: [],
  origin: { kind: 'class', classId: 'pr' },
};

const pedidoProductoJoinTable: RelationalTable = {
  id: 'r2',
  name: 'pedido_producto',
  columns: [
    { id: 'r2:source', name: 'pedido_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r2', end: 'source' } },
    { id: 'r2:target', name: 'producto_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r2', end: 'target' } },
  ],
  primaryKey: { columns: ['pedido_id', 'producto_id'] },
  foreignKeys: [
    { id: 'r2:source-fk', columns: ['pedido_id'], referencedTable: 'pedido', referencedColumns: ['id'] },
    { id: 'r2:target-fk', columns: ['producto_id'], referencedTable: 'producto', referencedColumns: ['id'] },
  ],
  uniqueConstraints: [],
  origin: { kind: 'many-to-many', relationshipId: 'r2' },
};

describe('proyecto mínimo', () => {
  it('genera build file, clase principal y application config', () => {
    const model: RelationalModel = { tables: [] };
    const project = expectOk(generateSpringBootProject(model));
    expect(project.files.some((f) => f.path === 'pom.xml')).toBe(true);
    expect(project.files.some((f) => f.path === 'src/main/resources/application.properties')).toBe(true);
    expect(project.files.some((f) => f.path.endsWith('Application.java'))).toBe(true);
    expect(project.files.some((f) => f.path === 'README.md')).toBe(true);
    expect(project.files.some((f) => f.path === '.gitignore')).toBe(true);
  });

  it('el puerto del servidor es configurable por variable de entorno (necesario para correr varias instancias en paralelo)', () => {
    const project = expectOk(generateSpringBootProject({ tables: [] }));
    const props = findFile(project, 'src/main/resources/application.properties').content;
    expect(props).toContain('server.port=${SERVER_PORT:8080}');
  });

  it('regresión: genera CORS permisivo -- sin esto, un cliente en otro origen (ej. la app móvil en modo web) no puede leer ninguna respuesta del backend generado', () => {
    const project = expectOk(generateSpringBootProject({ tables: [] }));
    const config = findFile(project, 'src/main/java/com/sharegrams/generated/config/WebConfig.java').content;
    expect(config).toContain('addCorsMappings');
    expect(config).toContain('allowedOriginPatterns("*")');
  });
});

describe('manejo de errores', () => {
  it('GlobalExceptionHandler mapea violaciones de constraint de base de datos a 409, no a un 500 genérico', () => {
    const project = expectOk(generateSpringBootProject({ tables: [] }));
    const handler = findFile(project, 'src/main/java/com/sharegrams/generated/exception/GlobalExceptionHandler.java').content;
    expect(handler).toContain('DataIntegrityViolationException');
    expect(handler).toContain('HttpStatus.CONFLICT');
  });
});

describe('entidad simple', () => {
  it('genera Entity, Repository, Service, Controller, DTOs', () => {
    const model: RelationalModel = { tables: [clienteTable] };
    const project = expectOk(generateSpringBootProject(model));
    const root = 'src/main/java/com/sharegrams/generated';
    expect(findFile(project, `${root}/model/Cliente.java`).content).toContain('public class Cliente');
    expect(findFile(project, `${root}/repository/ClienteRepository.java`).content).toContain('extends JpaRepository<Cliente, Long>');
    expect(findFile(project, `${root}/service/ClienteService.java`).content).toContain('public class ClienteService');
    expect(findFile(project, `${root}/controller/ClienteController.java`).content).toContain('@RequestMapping("/api/clientes")');
    expect(findFile(project, `${root}/dto/ClienteRequest.java`).content).toContain('public class ClienteRequest');
    expect(findFile(project, `${root}/dto/ClienteResponse.java`).content).toContain('public class ClienteResponse');
  });

  it('marca @Column(nullable=false) para columnas obligatorias y @NotBlank en el Request', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable] }));
    const entity = findFile(project, 'src/main/java/com/sharegrams/generated/model/Cliente.java').content;
    expect(entity).toContain('@Column(name = "nombre", nullable = false)');
    expect(entity).toContain('@Column(name = "email")');
    expect(entity).not.toContain('@Column(name = "email", nullable = false)');
    const request = findFile(project, 'src/main/java/com/sharegrams/generated/dto/ClienteRequest.java').content;
    expect(request).toContain('@NotBlank');
  });
});

describe('tipos', () => {
  it('rechaza un tipo relacional no soportado', () => {
    const badTable: RelationalTable = {
      ...clienteTable,
      columns: [...clienteTable.columns, { id: 'x', name: 'x', type: 'MONEY' as never, nullable: true, origin: { kind: 'attribute', classId: 'c', attributeId: 'x' } }],
    };
    expectFail(generateSpringBootProject({ tables: [badTable] }), 'UNSUPPORTED_JAVA_TYPE');
  });
});

describe('primary key simple', () => {
  it('genera @Id + @GeneratedValue(IDENTITY) y JpaRepository<Entity, Long>', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable] }));
    const entity = findFile(project, 'src/main/java/com/sharegrams/generated/model/Cliente.java').content;
    expect(entity).toContain('@Id');
    expect(entity).toContain('@GeneratedValue(strategy = GenerationType.IDENTITY)');
    expect(entity).toContain('private Long id;');
  });

  it('regresión: rechaza una PK de tipo String -- Postgres no permite IDENTITY en columnas no numéricas (bug real: tabla nunca se creaba, 500 en cada request)', () => {
    const clienteConPkString: RelationalTable = {
      ...clienteTable,
      columns: clienteTable.columns.map((c) => (c.name === 'id' ? { ...c, type: 'VARCHAR' } : c)),
    };
    expectFail(generateSpringBootProject({ tables: [clienteConPkString] }), 'UNSUPPORTED_PRIMARY_KEY_TYPE');
  });
});

describe('foreign key many-to-one', () => {
  it('Pedido tiene @ManyToOne hacia Cliente', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable, pedidoTable] }));
    const entity = findFile(project, 'src/main/java/com/sharegrams/generated/model/Pedido.java').content;
    expect(entity).toContain('@ManyToOne(fetch = FetchType.LAZY, optional = false)');
    expect(entity).toContain('@JoinColumn(name = "cliente_id", nullable = false)');
    expect(entity).toContain('private Cliente cliente;');
  });

  it('el Request de Pedido expone clienteId (no un objeto Cliente anidado)', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable, pedidoTable] }));
    const request = findFile(project, 'src/main/java/com/sharegrams/generated/dto/PedidoRequest.java').content;
    expect(request).toContain('private Long clienteId;');
    expect(request).not.toContain('Cliente cliente');
  });
});

describe('one-to-one', () => {
  it('FK con UNIQUE constraint genera @OneToOne', () => {
    const pasaporteTable: RelationalTable = {
      id: 'pasaporte',
      name: 'pasaporte',
      columns: [
        { id: 'pa-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'pa', attributeId: 'pa-id' } },
        { id: 'r3:fk', name: 'persona_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r3', end: 'target' } },
      ],
      primaryKey: { columns: ['id'] },
      foreignKeys: [{ id: 'r3:fk', columns: ['persona_id'], referencedTable: 'persona', referencedColumns: ['id'] }],
      uniqueConstraints: [{ columns: ['persona_id'] }],
      origin: { kind: 'class', classId: 'pa' },
    };
    const personaTable: RelationalTable = { ...clienteTable, id: 'persona', name: 'persona' };
    const project = expectOk(generateSpringBootProject({ tables: [personaTable, pasaporteTable] }));
    const entity = findFile(project, 'src/main/java/com/sharegrams/generated/model/Pasaporte.java').content;
    expect(entity).toContain('@OneToOne(fetch = FetchType.LAZY, optional = false)');
    expect(entity).toContain('@JoinColumn(name = "persona_id", nullable = false, unique = true)');
  });
});

describe('tabla asociativa N:M pura', () => {
  it('no genera Entity/Controller propios; genera @ManyToMany + @JoinTable en Pedido', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable, pedidoTable, productoTable, pedidoProductoJoinTable] }));
    expect(project.files.some((f) => f.path.includes('PedidoProducto'))).toBe(false);
    const pedido = findFile(project, 'src/main/java/com/sharegrams/generated/model/Pedido.java').content;
    expect(pedido).toContain('@ManyToMany');
    expect(pedido).toContain('name = "pedido_producto"');
    expect(pedido).toContain('joinColumns = @JoinColumn(name = "pedido_id")');
    expect(pedido).toContain('inverseJoinColumns = @JoinColumn(name = "producto_id")');
    expect(pedido).toContain('Set<Producto> productos');
    const producto = findFile(project, 'src/main/java/com/sharegrams/generated/model/Producto.java').content;
    expect(producto).not.toContain('@ManyToMany');
  });

  it('expone la colección N:M en los DTO y el Service como ids (no objetos anidados)', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable, pedidoTable, productoTable, pedidoProductoJoinTable] }));
    const request = findFile(project, 'src/main/java/com/sharegrams/generated/dto/PedidoRequest.java').content;
    expect(request).toContain('private Set<Long> productosIds;');
    const response = findFile(project, 'src/main/java/com/sharegrams/generated/dto/PedidoResponse.java').content;
    expect(response).toContain('private Set<Long> productosIds;');
    const service = findFile(project, 'src/main/java/com/sharegrams/generated/service/PedidoService.java').content;
    expect(service).toContain('productoRepository.findAllById(request.getProductosIds())');
    expect(service).toContain('response.setProductosIds(entity.getProductos().stream().map(Producto::getId).collect(Collectors.toSet()));');
    // Regresión: la referencia a método "Producto::getId" necesita la clase model importada
    // (a diferencia de entity.getCliente().getId(), que no la nombra directamente) -- sin este
    // import el backend generado no compila aunque el string de arriba esté bien.
    expect(service).toContain('import com.sharegrams.generated.model.Producto;');
  });

  it('regresión: una entidad con SOLO @ManyToMany (sin ningún @ManyToOne) igual importa JoinColumn', () => {
    // A diferencia de Pedido (que también tiene @ManyToOne a Cliente, lo que ya importaba
    // JoinColumn por otra razón y tapaba este bug), acá no hay ninguna otra relación.
    const estudianteTable: RelationalTable = { ...clienteTable, id: 'estudiante', name: 'estudiante' };
    const materiaTable: RelationalTable = { ...productoTable, id: 'materia', name: 'materia' };
    const joinTable: RelationalTable = {
      id: 'r5',
      name: 'estudiante_materia',
      columns: [
        { id: 'r5:source', name: 'estudiante_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r5', end: 'source' } },
        { id: 'r5:target', name: 'materia_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r5', end: 'target' } },
      ],
      primaryKey: { columns: ['estudiante_id', 'materia_id'] },
      foreignKeys: [
        { id: 'r5:source-fk', columns: ['estudiante_id'], referencedTable: 'estudiante', referencedColumns: ['id'] },
        { id: 'r5:target-fk', columns: ['materia_id'], referencedTable: 'materia', referencedColumns: ['id'] },
      ],
      uniqueConstraints: [],
      origin: { kind: 'many-to-many', relationshipId: 'r5' },
    };
    const project = expectOk(generateSpringBootProject({ tables: [estudianteTable, materiaTable, joinTable] }));
    const entity = findFile(project, 'src/main/java/com/sharegrams/generated/model/Estudiante.java').content;
    expect(entity).toContain('import jakarta.persistence.JoinColumn;');
  });

  it('regresión: el Service es @Transactional (encontrado en Fase 11 -- sin esto, PUT de una colección N:M no se sincroniza con la base)', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable] }));
    const service = findFile(project, 'src/main/java/com/sharegrams/generated/service/ClienteService.java').content;
    expect(service).toContain('import org.springframework.transaction.annotation.Transactional;');
    expect(service).toContain('@Transactional');
  });

  it('regresión: el getter del id de una entidad relacionada NO siempre se llama getId() (bug real: un usuario nombró su PK "ci")', () => {
    // Mismo caso que rompió un backend real generado por un usuario: Producto
    // con su columna de PK llamada "codigo" en vez de "id" -- tanto el lado
    // @ManyToOne (Pedido -> Cliente) como el @ManyToMany (Pedido -> Producto)
    // necesitan el getter REAL del target, no un "getId()" hardcodeado.
    const clienteConCodigo: RelationalTable = {
      ...clienteTable,
      columns: clienteTable.columns.map((c) => (c.name === 'id' ? { ...c, id: 'c-codigo', name: 'codigo' } : c)),
      primaryKey: { columns: ['codigo'] },
    };
    const productoConCodigo: RelationalTable = {
      ...productoTable,
      columns: productoTable.columns.map((c) => (c.name === 'id' ? { ...c, id: 'pr-codigo', name: 'codigo' } : c)),
      primaryKey: { columns: ['codigo'] },
    };
    const pedidoTableFixed: RelationalTable = {
      ...pedidoTable,
      foreignKeys: [{ id: 'r1:fk', columns: ['cliente_id'], referencedTable: 'cliente', referencedColumns: ['codigo'] }],
    };
    const joinTableFixed: RelationalTable = {
      ...pedidoProductoJoinTable,
      foreignKeys: [
        { id: 'r2:source-fk', columns: ['pedido_id'], referencedTable: 'pedido', referencedColumns: ['id'] },
        { id: 'r2:target-fk', columns: ['producto_id'], referencedTable: 'producto', referencedColumns: ['codigo'] },
      ],
    };

    const project = expectOk(generateSpringBootProject({ tables: [clienteConCodigo, pedidoTableFixed, productoConCodigo, joinTableFixed] }));
    const service = findFile(project, 'src/main/java/com/sharegrams/generated/service/PedidoService.java').content;

    // @ManyToOne: entity.getCliente().getCodigo(), NO .getId()
    expect(service).toContain('response.setClienteId(entity.getCliente() == null ? null : entity.getCliente().getCodigo());');
    expect(service).not.toContain('.getCliente().getId()');

    // @ManyToMany: Producto::getCodigo, NO Producto::getId
    expect(service).toContain('response.setProductosIds(entity.getProductos().stream().map(Producto::getCodigo).collect(Collectors.toSet()));');
    expect(service).not.toContain('Producto::getId');
  });
});

describe('primary key compuesta (tabla asociativa con atributos propios)', () => {
  const ventaTable: RelationalTable = { ...clienteTable, id: 'venta', name: 'venta' };
  const detalleVentaTable: RelationalTable = {
    id: 'detalle_venta',
    name: 'detalle_venta',
    columns: [
      { id: 'dv-venta', name: 'venta_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r4', end: 'source' } },
      { id: 'dv-producto', name: 'producto_id', type: 'BIGINT', nullable: false, origin: { kind: 'relationship-fk', relationshipId: 'r4', end: 'target' } },
      { id: 'dv-cantidad', name: 'cantidad', type: 'INTEGER', nullable: false, origin: { kind: 'attribute', classId: 'dv', attributeId: 'dv-cantidad' } },
    ],
    primaryKey: { columns: ['venta_id', 'producto_id'] },
    foreignKeys: [
      { id: 'r4:source-fk', columns: ['venta_id'], referencedTable: 'venta', referencedColumns: ['id'] },
      { id: 'r4:target-fk', columns: ['producto_id'], referencedTable: 'producto', referencedColumns: ['id'] },
    ],
    uniqueConstraints: [],
    origin: { kind: 'many-to-many', relationshipId: 'r4' },
  };

  it('genera una Entity real con @EmbeddedId (no @ManyToMany), sin perder el atributo propio', () => {
    const project = expectOk(generateSpringBootProject({ tables: [ventaTable, productoTable, detalleVentaTable] }));
    const embeddedId = findFile(project, 'src/main/java/com/sharegrams/generated/model/DetalleVentaId.java').content;
    expect(embeddedId).toContain('@Embeddable');
    expect(embeddedId).toContain('private Long ventaId;');
    expect(embeddedId).toContain('private Long productoId;');
    const entity = findFile(project, 'src/main/java/com/sharegrams/generated/model/DetalleVenta.java').content;
    expect(entity).toContain('@EmbeddedId');
    expect(entity).toContain('@MapsId("ventaId")');
    expect(entity).toContain('@MapsId("productoId")');
    expect(entity).toContain('private Integer cantidad;');
  });

  it('regresión: el Response DTO no declara un campo "id: DetalleVentaId" roto (esa clase vive en el package model, no en dto) -- la identidad ya sale de ventaId/productoId', () => {
    const project = expectOk(generateSpringBootProject({ tables: [ventaTable, productoTable, detalleVentaTable] }));
    const response = findFile(project, 'src/main/java/com/sharegrams/generated/dto/DetalleVentaResponse.java').content;
    expect(response).not.toContain('DetalleVentaId');
    expect(response).toContain('private Long ventaId;');
    expect(response).toContain('private Long productoId;');
  });
});

describe('nullable', () => {
  it('FK opcional genera @JoinColumn(nullable=true) y @ManyToOne(optional=true)', () => {
    const optionalPedido: RelationalTable = {
      ...pedidoTable,
      columns: pedidoTable.columns.map((c) => (c.name === 'cliente_id' ? { ...c, nullable: true } : c)),
    };
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable, optionalPedido] }));
    const entity = findFile(project, 'src/main/java/com/sharegrams/generated/model/Pedido.java').content;
    expect(entity).toContain('@ManyToOne(fetch = FetchType.LAZY, optional = true)');
    expect(entity).toContain('@JoinColumn(name = "cliente_id", nullable = true)');
  });
});

describe('herencia (JOINED)', () => {
  const personaTable: RelationalTable = {
    id: 'persona',
    name: 'persona',
    columns: [
      { id: 'pe-id', name: 'id', type: 'BIGINT', nullable: false, origin: { kind: 'attribute', classId: 'pe', attributeId: 'pe-id' } },
      { id: 'pe-nombre', name: 'nombre', type: 'VARCHAR', nullable: false, origin: { kind: 'attribute', classId: 'pe', attributeId: 'pe-nombre' } },
    ],
    primaryKey: { columns: ['id'] },
    foreignKeys: [],
    uniqueConstraints: [],
    origin: { kind: 'class', classId: 'pe' },
  };
  const clienteSubtypeTable: RelationalTable = {
    id: 'cliente',
    name: 'cliente',
    columns: [{ id: 'g1:pk', name: 'persona_id', type: 'BIGINT', nullable: false, origin: { kind: 'generalization-fk', relationshipId: 'g1' } }],
    primaryKey: { columns: ['persona_id'] },
    foreignKeys: [{ id: 'g1:fk', columns: ['persona_id'], referencedTable: 'persona', referencedColumns: ['id'] }],
    uniqueConstraints: [],
    origin: { kind: 'class', classId: 'cliente' },
  };

  it('la raíz lleva @Inheritance(JOINED) y la subclase extends + @PrimaryKeyJoinColumn', () => {
    const project = expectOk(generateSpringBootProject({ tables: [personaTable, clienteSubtypeTable] }));
    const persona = findFile(project, 'src/main/java/com/sharegrams/generated/model/Persona.java').content;
    expect(persona).toContain('@Inheritance(strategy = InheritanceType.JOINED)');
    const cliente = findFile(project, 'src/main/java/com/sharegrams/generated/model/Cliente.java').content;
    expect(cliente).toContain('public class Cliente extends Persona');
    expect(cliente).toContain('@PrimaryKeyJoinColumn(name = "persona_id")');
    expect(cliente).not.toContain('private Long id;');
  });

  it('el Response de Cliente incluye el id y el nombre heredados de Persona', () => {
    const project = expectOk(generateSpringBootProject({ tables: [personaTable, clienteSubtypeTable] }));
    const response = findFile(project, 'src/main/java/com/sharegrams/generated/dto/ClienteResponse.java').content;
    expect(response).toContain('private Long id;');
    expect(response).toContain('private String nombre;');
  });
});

describe('determinismo e inmutabilidad', () => {
  const model: RelationalModel = { tables: [clienteTable, pedidoTable, productoTable, pedidoProductoJoinTable] };

  it('generar el mismo RelationalModel dos veces produce exactamente el mismo proyecto', () => {
    const first = expectOk(generateSpringBootProject(model));
    const second = expectOk(generateSpringBootProject(model));
    expect(second).toEqual(first);
  });

  it('no muta el RelationalModel de entrada', () => {
    const snapshot = JSON.parse(JSON.stringify(model));
    generateSpringBootProject(model);
    expect(model).toEqual(snapshot);
  });
});

describe('caso de aceptación: Cliente / Pedido / Producto + pedido_producto', () => {
  it('genera un proyecto completo y consistente', () => {
    const model: RelationalModel = { tables: [clienteTable, pedidoTable, productoTable, pedidoProductoJoinTable] };
    const project = expectOk(generateSpringBootProject(model, DEFAULT_GENERATION_OPTIONS));
    const paths = project.files.map((f) => f.path);
    expect(paths).toContain('pom.xml');
    expect(paths.filter((p) => p.includes('/model/')).sort()).toEqual([
      'src/main/java/com/sharegrams/generated/model/Cliente.java',
      'src/main/java/com/sharegrams/generated/model/Pedido.java',
      'src/main/java/com/sharegrams/generated/model/Producto.java',
    ]);
    // 3 controllers de entidad (Cliente/Pedido/Producto) + MetaController (Fase 12, infraestructura de /api/meta, no una entidad).
    expect(paths.filter((p) => p.includes('/controller/'))).toHaveLength(4);
    expect(paths).toContain('src/main/java/com/sharegrams/generated/controller/MetaController.java');
    expect(paths).toContain('src/main/resources/manifest.json');
  });
});

describe('Fase 12: endpoint /api/meta', () => {
  it('MetaController expone GET /api/meta y lee manifest.json como recurso -- no es una entidad (sin Repository/Service)', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable] }));
    const controller = findFile(project, 'src/main/java/com/sharegrams/generated/controller/MetaController.java').content;
    expect(controller).toContain('@GetMapping("/api/meta")');
    expect(controller).toContain('new ClassPathResource("manifest.json")');
    expect(project.files.some((f) => f.path.includes('MetaRepository'))).toBe(false);
    expect(project.files.some((f) => f.path.includes('MetaService'))).toBe(false);
  });

  it('manifest.json es JSON válido, versionado, y describe las entidades reales del proyecto', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable, pedidoTable] }));
    const manifest = JSON.parse(findFile(project, 'src/main/resources/manifest.json').content);
    expect(manifest.version).toBe('1.0');
    expect(manifest.entities.map((e: { name: string }) => e.name).sort()).toEqual(['Cliente', 'Pedido']);
  });

  it('sin UMLModel de origen, cae a un label humanizado del nombre de tabla (no rompe la generación)', () => {
    const project = expectOk(generateSpringBootProject({ tables: [clienteTable] }));
    const manifest = JSON.parse(findFile(project, 'src/main/resources/manifest.json').content);
    expect(manifest.entities[0].label).toBe('Cliente');
  });

  it('con UMLModel de origen, usa el nombre original de la clase como label (no el humanizado)', () => {
    const clienteVipTable: RelationalTable = {
      ...clienteTable,
      id: 'cliente_vip',
      name: 'cliente_vip',
      origin: { kind: 'class', classId: 'cliente_vip' },
    };
    const umlModel = { classes: [{ id: 'cliente_vip', name: 'ClienteVIP', attributes: [], position: { x: 0, y: 0 } }], relationships: [] };
    const project = expectOk(generateSpringBootProject({ tables: [clienteVipTable] }, DEFAULT_GENERATION_OPTIONS, umlModel));
    const manifest = JSON.parse(findFile(project, 'src/main/resources/manifest.json').content);
    // Humanizar "cliente_vip" daría "Cliente Vip" -- el label real, "ClienteVIP", solo puede venir del UMLModel.
    expect(manifest.entities[0].label).toBe('ClienteVIP');
  });
});
