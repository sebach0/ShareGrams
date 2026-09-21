import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { DiscoveryScreen } from './src/screens/DiscoveryScreen';
import { useBackendConnection } from './src/state/useBackendConnection';

/**
 * Mismo build, cualquier backend generado por ShareGrams (regla 2/45): acá
 * no hay ni una sola referencia a "Cliente", "Paciente" ni ningún dominio
 * puntual -- solo `state.status` y, si está 'connected', el `manifest`
 * que trajo ESE backend en particular.
 */
export default function App() {
  const { state, connect, disconnect } = useBackendConnection();

  return (
    <SafeAreaView style={styles.root}>
      {state.status === 'connected' ? (
        <DiscoveryScreen url={state.url} manifest={state.manifest} onDisconnect={disconnect} />
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
