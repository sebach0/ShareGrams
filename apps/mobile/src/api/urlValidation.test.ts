import { describe, expect, it } from 'vitest';
import { validateBackendUrl } from './urlValidation';

describe('validateBackendUrl', () => {
  it('acepta una URL http válida', () => {
    expect(validateBackendUrl('http://192.168.1.30:8080')).toEqual({ ok: true, url: 'http://192.168.1.30:8080' });
  });

  it('acepta https', () => {
    expect(validateBackendUrl('https://mi-backend.com')).toEqual({ ok: true, url: 'https://mi-backend.com' });
  });

  it('quita la barra final', () => {
    expect(validateBackendUrl('http://localhost:8080/')).toEqual({ ok: true, url: 'http://localhost:8080' });
  });

  it('rechaza una URL vacía', () => {
    const result = validateBackendUrl('   ');
    expect(result.ok).toBe(false);
  });

  it('rechaza un formato inválido', () => {
    const result = validateBackendUrl('no-es-una-url');
    expect(result.ok).toBe(false);
  });

  it('rechaza un esquema que no sea http/https', () => {
    const result = validateBackendUrl('ftp://localhost:8080');
    expect(result.ok).toBe(false);
  });
});
