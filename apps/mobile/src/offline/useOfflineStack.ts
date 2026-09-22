import { useCallback, useEffect, useRef, useState } from 'react';
import type { DomainManifest } from '../domain/manifest';
import { createOfflineStack, type OfflineStack } from './createOfflineStack';
import { useConnectivity } from './connectivity';
import type { SyncSummary } from './syncEngine';

export interface OfflineStackState {
  stack: OfflineStack | null;
  online: boolean;
  syncing: boolean;
  lastSummary: SyncSummary | null;
  /** Dispara una pasada de sincronización a mano ("Sincronizar ahora"). No-op si ya hay una en curso o si el stack no terminó de armarse. */
  syncNow: () => Promise<void>;
}

/**
 * Arma el stack offline para el backend actualmente conectado (Fase 17) y
 * lo mantiene sincronizando: dispara `SyncEngine.processQueue()` solo, sin
 * que el usuario tenga que hacer nada, apenas el dispositivo recupera
 * conexión -- y expone `syncNow()` para el botón manual.
 */
export function useOfflineStack(baseUrl: string | null, manifest: DomainManifest | null): OfflineStackState {
  const [stack, setStack] = useState<OfflineStack | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);
  const stackRef = useRef<OfflineStack | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    stackRef.current = null;
    setStack(null);
    setLastSummary(null);
    if (!baseUrl || !manifest) return;

    let cancelled = false;
    createOfflineStack(baseUrl, manifest).then((created) => {
      if (cancelled) return;
      stackRef.current = created;
      setStack(created);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, manifest]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !stackRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const summary = await stackRef.current.syncEngine.processQueue();
      setLastSummary(summary);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  const { online } = useConnectivity(syncNow);

  return { stack, online, syncing, lastSummary, syncNow };
}
