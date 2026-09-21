import { describe, expect, it, vi, afterEach } from 'vitest';
import { generateId } from '../src/model/factory';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('generateId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('usa crypto.randomUUID() cuando está disponible', () => {
    const id = generateId();
    expect(id).toMatch(UUID_RE);
  });

  it('cae a crypto.getRandomValues() cuando randomUUID no existe (HTTP plano, contexto no seguro)', () => {
    const original = crypto.randomUUID;
    // @ts-expect-error -- simula un navegador en HTTP plano, donde randomUUID no existe.
    delete crypto.randomUUID;

    try {
      const id = generateId();
      expect(id).toMatch(UUID_RE);
      expect(id.charAt(14)).toBe('4'); // versión 4
      expect(['8', '9', 'a', 'b']).toContain(id.charAt(19)); // variante
    } finally {
      crypto.randomUUID = original;
    }
  });

  it('genera ids distintos en llamadas sucesivas incluso en el fallback', () => {
    const original = crypto.randomUUID;
    // @ts-expect-error -- ver arriba.
    delete crypto.randomUUID;

    try {
      const a = generateId();
      const b = generateId();
      expect(a).not.toBe(b);
    } finally {
      crypto.randomUUID = original;
    }
  });
});
