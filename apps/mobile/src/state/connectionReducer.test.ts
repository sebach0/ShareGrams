import { describe, expect, it } from 'vitest';
import { connectionReducer, initialConnectionState } from './connectionReducer';
import type { DomainManifest } from '../domain/manifest';

const manifest: DomainManifest = { version: '1.0', application: { name: 'Test' }, entities: [] };

describe('connectionReducer', () => {
  it('arranca desconectado', () => {
    expect(initialConnectionState).toEqual({ status: 'disconnected' });
  });

  it('CONNECT_START -> connecting', () => {
    const state = connectionReducer(initialConnectionState, { type: 'CONNECT_START', url: 'http://a' });
    expect(state).toEqual({ status: 'connecting', url: 'http://a' });
  });

  it('CONNECT_SUCCESS mientras conecta -> connected', () => {
    const connecting = connectionReducer(initialConnectionState, { type: 'CONNECT_START', url: 'http://a' });
    const state = connectionReducer(connecting, { type: 'CONNECT_SUCCESS', manifest });
    expect(state).toEqual({ status: 'connected', url: 'http://a', manifest });
  });

  it('CONNECT_SUCCESS ignorado si ya no está conectando (respuesta tardía de una conexión abandonada)', () => {
    const state = connectionReducer(initialConnectionState, { type: 'CONNECT_SUCCESS', manifest });
    expect(state).toEqual(initialConnectionState);
  });

  it('CONNECT_FAILURE -> error, con la URL y el mensaje', () => {
    const state = connectionReducer(initialConnectionState, { type: 'CONNECT_FAILURE', url: 'http://a', message: 'no responde' });
    expect(state).toEqual({ status: 'error', url: 'http://a', message: 'no responde' });
  });

  it('DISCONNECT vuelve a disconnected desde cualquier estado', () => {
    const connected: ReturnType<typeof connectionReducer> = { status: 'connected', url: 'http://a', manifest };
    expect(connectionReducer(connected, { type: 'DISCONNECT' })).toEqual({ status: 'disconnected' });
  });

  it('backend switching: desconectar y conectar a otra URL reemplaza el manifest anterior', () => {
    let state = connectionReducer(initialConnectionState, { type: 'CONNECT_START', url: 'http://ventas' });
    state = connectionReducer(state, { type: 'CONNECT_SUCCESS', manifest: { ...manifest, application: { name: 'Ventas' } } });
    state = connectionReducer(state, { type: 'DISCONNECT' });
    state = connectionReducer(state, { type: 'CONNECT_START', url: 'http://clinica' });
    state = connectionReducer(state, { type: 'CONNECT_SUCCESS', manifest: { ...manifest, application: { name: 'Clinica' } } });
    expect(state).toEqual({ status: 'connected', url: 'http://clinica', manifest: { ...manifest, application: { name: 'Clinica' } } });
  });
});
