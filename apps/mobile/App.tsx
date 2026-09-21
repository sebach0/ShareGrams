import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { DiscoveryScreen } from './src/screens/DiscoveryScreen';
import { EntityRecordsScreen } from './src/screens/EntityRecordsScreen';
import { useBackendConnection } from './src/state/useBackendConnection';
import type { EntityDefinition } from './src/domain/manifest';

/**
 * Mismo build, cualquier backend generado por ShareGrams (regla 2/45): acá
 * no hay ni una sola referencia a "Cliente", "Paciente" ni ningún dominio
 * puntual -- solo `state.status`, el `manifest` que trajo ESE backend en
 * particular, y (Fase 13) qué entidad del manifest está mirando el usuario.
 * `selectedEntity` se resetea solo al desconectar porque deja de ser un
 * dato válido: no hay "entidad seleccionada" sin conexión.
 */
export default function App() {
  const { state, connect, disconnect } = useBackendConnection();
  const [selectedEntity, setSelectedEntity] = useState<EntityDefinition | null>(null);

  const handleDisconnect = () => {
    setSelectedEntity(null);
    disconnect();
  };

  return (
    <SafeAreaView style={styles.root}>
      {state.status === 'connected' && selectedEntity ? (
        <EntityRecordsScreen
          baseUrl={state.url}
          manifest={state.manifest}
          entity={selectedEntity}
          onBack={() => setSelectedEntity(null)}
        />
      ) : state.status === 'connected' ? (
        <DiscoveryScreen url={state.url} manifest={state.manifest} onDisconnect={handleDisconnect} onSelectEntity={setSelectedEntity} />
      ) : (
        <ConnectScreen state={state} onConnect={connect} />
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
});
