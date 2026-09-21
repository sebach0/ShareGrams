import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ConnectionState } from '../state/connectionReducer';

interface Props {
  state: ConnectionState;
  onConnect: (url: string) => void;
}

/** Pantalla 1 (regla 25): URL del backend + botón Conectar. Sin IP hardcodeada -- el usuario la escribe. */
export function ConnectScreen({ state, onConnect }: Props) {
  const [url, setUrl] = useState(state.status !== 'disconnected' ? state.url : '');
  const isConnecting = state.status === 'connecting';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ShareGrams</Text>
      <Text style={styles.subtitle}>Conectate a un backend generado</Text>

      <TextInput
        style={styles.input}
        placeholder="http://192.168.1.30:8080"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
        editable={!isConnecting}
      />

      <TouchableOpacity style={styles.button} onPress={() => onConnect(url)} disabled={isConnecting}>
        {isConnecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Conectar</Text>}
      </TouchableOpacity>

      {state.status === 'error' && <Text style={styles.error}>{state.message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  error: { color: '#dc2626', textAlign: 'center', marginTop: 8 },
});
