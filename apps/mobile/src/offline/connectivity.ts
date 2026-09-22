import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Única fuente de "¿hay internet?" de toda la app (Fase 17) -- antes de
 * esta fase no existía ninguna detección de conectividad real (Manifest
 * cargado != dispositivo con internet). `isInternetReachable` puede venir
 * `null` mientras el chequeo todavía no resolvió; en ese caso NO se
 * asume desconectado (evita spinners de "sin conexión" falsos apenas
 * arranca la app) -- solo `false` explícito cuenta como offline.
 */
export interface ConnectivityState {
  online: boolean;
}

export function isOnline(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

/** Hook de React: estado actual + un callback opcional cuando se pasa de offline a online (para disparar el SyncEngine). */
export function useConnectivity(onReconnect?: () => void): ConnectivityState {
  const [online, setOnline] = useState(true);
  const wasOnline = useRef(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const nowOnline = isOnline(state);
      setOnline(nowOnline);
      if (nowOnline && !wasOnline.current) onReconnect?.();
      wasOnline.current = nowOnline;
    });
    return unsubscribe;
  }, [onReconnect]);

  return { online };
}
