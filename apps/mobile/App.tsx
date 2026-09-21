import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { DiscoveryScreen } from './src/screens/DiscoveryScreen';
import { EntityRecordsScreen } from './src/screens/EntityRecordsScreen';
import { CommandConsoleScreen } from './src/screens/CommandConsoleScreen';
import { useBackendConnection } from './src/state/useBackendConnection';
import type { EntityDefinition } from './src/domain/manifest';

type ConnectedView = { kind: 'discovery' } | { kind: 'records'; entity: EntityDefinition } | { kind: 'console' };

/**
 * Mismo build, cualquier backend generado por ShareGrams (regla 2/45): acá
 * no hay ni una sola referencia a "Cliente", "Paciente" ni ningún dominio
 * puntual -- solo `state.status`, el `manifest` que trajo ESE backend en
 * particular, y (Fase 13) qué pantalla conectada está mirando el usuario.
 * `view` se resetea solo al desconectar porque deja de ser un dato válido:
 * no hay "pantalla conectada" sin conexión.
 */
export default function App() {
  const { state, connect, disconnect } = useBackendConnection();
  const [view, setView] = useState<ConnectedView>({ kind: 'discovery' });

  const handleDisconnect = () => {
    setView({ kind: 'discovery' });
    disconnect();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        {state.status === 'connected' && view.kind === 'records' ? (
          <EntityRecordsScreen baseUrl={state.url} manifest={state.manifest} entity={view.entity} onBack={() => setView({ kind: 'discovery' })} />
        ) : state.status === 'connected' && view.kind === 'console' ? (
          <CommandConsoleScreen baseUrl={state.url} manifest={state.manifest} onBack={() => setView({ kind: 'discovery' })} />
        ) : state.status === 'connected' ? (
          <DiscoveryScreen
            url={state.url}
            manifest={state.manifest}
            onDisconnect={handleDisconnect}
            onSelectEntity={(entity) => setView({ kind: 'records', entity })}
            onOpenConsole={() => setView({ kind: 'console' })}
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
});
