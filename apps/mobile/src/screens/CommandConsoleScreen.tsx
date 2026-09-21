import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { runDynamicCommand } from '../engine/runDynamicCommand';
import { DynamicRepository } from '../engine/dynamicRepository';
import type { CommandResult } from '../engine/commandResult';
import type { DomainManifest } from '../domain/manifest';

interface Props {
  baseUrl: string;
  manifest: DomainManifest;
  onBack: () => void;
}

const PLACEHOLDER = `{
  "action": "LIST",
  "entity": "${'Entidad'}"
}`;

/**
 * Herramienta de desarrollo (regla 52-53), NO la UI final de ShareGrams:
 * ejecuta un DynamicCommand escrito a mano contra el backend conectado,
 * pasando por EXACTAMENTE el mismo runDynamicCommand (Validator + Executor)
 * que usan las pantallas de la app y que va a usar Claude en una fase
 * futura. Sirve para probar manualmente lo que ya cubren los tests
 * automatizados (commandValidator.test.ts, dynamicRepository.test.ts,
 * runDynamicCommand.test.ts) contra un backend real.
 */
export function CommandConsoleScreen({ baseUrl, manifest, onBack }: Props) {
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CommandResult | { status: 'PARSE_ERROR'; message: string } | null>(null);

  const handleRun = async () => {
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setResult({ status: 'PARSE_ERROR', message: err instanceof Error ? err.message : 'JSON inválido.' });
      return;
    }

    setRunning(true);
    const repository = new DynamicRepository(baseUrl);
    const commandResult = await runDynamicCommand(parsed, manifest, repository);
    setRunning(false);
    setResult(commandResult);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← {manifest.application.name}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Consola de comandos (dev)</Text>
        <Text style={styles.subtitle}>Entidades: {manifest.entities.map((e) => e.name).join(', ')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <TextInput
          style={styles.textarea}
          multiline
          value={text}
          onChangeText={setText}
          placeholder={PLACEHOLDER}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TouchableOpacity style={styles.runButton} onPress={handleRun} disabled={running || !text.trim()}>
          {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.runText}>Ejecutar</Text>}
        </TouchableOpacity>

        {result && (
          <View style={[styles.resultBox, result.status === 'SUCCESS' ? styles.resultOk : styles.resultError]}>
            <Text style={styles.resultStatus}>{result.status}</Text>
            {'message' in result && result.message && <Text style={styles.resultText}>{result.message}</Text>}
            {'diagnostics' in result && result.diagnostics && (
              <Text style={styles.resultText}>{JSON.stringify(result.diagnostics, null, 2)}</Text>
            )}
            {'data' in result && result.data !== undefined && <Text style={styles.resultText}>{JSON.stringify(result.data, null, 2)}</Text>}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, paddingBottom: 8 },
  back: { color: '#2563eb', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, color: '#888', marginTop: 4 },
  body: { padding: 20, paddingTop: 8, gap: 12 },
  textarea: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 14, fontFamily: 'monospace', minHeight: 160, textAlignVertical: 'top' },
  runButton: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  runText: { color: '#fff', fontWeight: '600' },
  resultBox: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 6 },
  resultOk: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  resultError: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  resultStatus: { fontWeight: '700', fontSize: 14 },
  resultText: { fontSize: 12, fontFamily: 'monospace', color: '#333' },
});
