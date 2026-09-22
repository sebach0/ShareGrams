import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { DiscoveryScreen } from './src/screens/DiscoveryScreen';
import { EntityRecordsScreen } from './src/screens/EntityRecordsScreen';
import { DynamicEntityDetailScreen } from './src/screens/DynamicEntityDetailScreen';
import { CommandConsoleScreen } from './src/screens/CommandConsoleScreen';
import { AIChatScreen } from './src/screens/AIChatScreen';
import { useBackendConnection } from './src/state/useBackendConnection';
import { useOfflineStack } from './src/offline/useOfflineStack';
import type { EntityDefinition } from './src/domain/manifest';
import type { DynamicEntity } from './src/engine/dynamicEntity';

type ConnectedView =
  | { kind: 'discovery' }
  | { kind: 'records'; entity: EntityDefinition }
  | { kind: 'detail'; entity: EntityDefinition; record: DynamicEntity }
  | { kind: 'console' }
  | { kind: 'assistant' };

/**
 * Mismo build, cualquier backend generado por ShareGrams (regla 2/45/73):
 * acá no hay ni una sola referencia a "Cliente", "Paciente" ni ningún
 * dominio puntual -- solo `state.status`, el `manifest` que trajo ESE
 * backend en particular, y qué pantalla conectada está mirando el usuario.
 * `view` se resetea solo al desconectar (regla 53/54): deja de ser un dato
 * válido, no hay "pantalla conectada" sin conexión, y evita mezclar el
 * estado de navegación de un dominio con el de otro al cambiar de backend.
 */
export default function App() {
  const { state, connect, disconnect } = useBackendConnection();
  const [view, setView] = useState<ConnectedView>({ kind: 'discovery' });

  // Fase 17: un solo stack offline (local + cola + sync) por backend conectado --
  // `null`/`null` mientras no hay conexión, así que acá no se arma nada.
  const offline = useOfflineStack(state.status === 'connected' ? state.url : null, state.status === 'connected' ? state.manifest : null);

  const handleDisconnect = () => {
    setView({ kind: 'discovery' });
    disconnect();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        {state.status === 'connected' && view.kind === 'detail' ? (
          offline.stack ? (
            <DynamicEntityDetailScreen
              dataSource={offline.stack.dataSource}
              manifest={state.manifest}
              entity={view.entity}
              record={view.record}
              onBack={() => setView({ kind: 'records', entity: view.entity })}
            />
          ) : (
            <ActivityIndicator style={styles.loading} />
          )
        ) : state.status === 'connected' && view.kind === 'records' ? (
          offline.stack ? (
            <EntityRecordsScreen
              dataSource={offline.stack.dataSource}
              manifest={state.manifest}
              entity={view.entity}
              onBack={() => setView({ kind: 'discovery' })}
              onSelectRecord={(record) => setView({ kind: 'detail', entity: view.entity, record })}
            />
          ) : (
            <ActivityIndicator style={styles.loading} />
          )
        ) : state.status === 'connected' && view.kind === 'console' ? (
          <CommandConsoleScreen baseUrl={state.url} manifest={state.manifest} onBack={() => setView({ kind: 'discovery' })} />
        ) : state.status === 'connected' && view.kind === 'assistant' ? (
          <AIChatScreen baseUrl={state.url} manifest={state.manifest} onBack={() => setView({ kind: 'discovery' })} />
        ) : state.status === 'connected' ? (
          <DiscoveryScreen
            url={state.url}
            manifest={state.manifest}
            onDisconnect={handleDisconnect}
            onSelectEntity={(entity) => setView({ kind: 'records', entity })}
            onOpenConsole={() => setView({ kind: 'console' })}
            onOpenAssistant={() => setView({ kind: 'assistant' })}
            offline={{ online: offline.online, syncing: offline.syncing, lastSummary: offline.lastSummary, onSyncNow: offline.syncNow }}
          />
        ) : (
          <ConnectScreen state={state} onConnect={connect} />
        )}
        <StatusBar style="auto" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1 },
});
