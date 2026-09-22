import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { interpretInstruction } from '../ai/aiCommandInterpreter';
import { coerceAiCommand } from '../ai/coerceAiCommand';
import { runDynamicCommand } from '../engine/runDynamicCommand';
import { DynamicRepository } from '../engine/dynamicRepository';
import type { CommandResult } from '../engine/commandResult';
import type { DomainManifest } from '../domain/manifest';

interface Props {
  baseUrl: string;
  manifest: DomainManifest;
  onBack: () => void;
}

type Entry = {
  instruction: string;
  status: 'CLARIFICATION_REQUIRED' | 'INVALID_REQUEST' | 'AI_ERROR' | 'NOT_CONFIGURED' | 'EXECUTED';
  message: string;
  command?: Record<string, unknown>;
  result?: CommandResult;
};

/**
 * UI mínima para Fase 15 (regla 16-17): NO es un chat inteligente, no tiene
 * memoria conversacional -- cada instrucción es un pedido stateless
 * independiente. El flujo es siempre:
 *
 *   texto -> AICommandInterpreter (Claude, server-side) -> comando candidato
 *         -> runDynamicCommand (CommandValidator -> CommandExecutor, Fase 13)
 *
 * Un DynamicCommand generado por Claude NUNCA se ejecuta directo (regla 18):
 * pasa por exactamente el mismo runDynamicCommand que usa el formulario y
 * la consola de comandos manual.
 */
export function AIChatScreen({ baseUrl, manifest, onBack }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);

  const handleSend = async () => {
    const instruction = text.trim();
    if (!instruction) return;
    setText('');
    setBusy(true);

    const aiResult = await interpretInstruction(instruction, manifest);

    if (aiResult.status !== 'COMMAND') {
      setEntries((prev) => [...prev, { instruction, status: aiResult.status, message: aiResult.message }]);
      setBusy(false);
      return;
    }

    const coerced = coerceAiCommand(aiResult.command, manifest);
    const repository = new DynamicRepository(baseUrl);
    const result = await runDynamicCommand(coerced, manifest, repository);

    setEntries((prev) => [
      ...prev,
      { instruction, status: 'EXECUTED', message: aiResult.message, command: aiResult.command, result },
    ]);
    setBusy(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← {manifest.application.name}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🤖 Asistente (IA)</Text>
        <Text style={styles.subtitle}>Escribí un pedido en lenguaje natural, ej. "Creá un {manifest.entities[0]?.label ?? 'registro'} llamado..."</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {entries.map((entry, index) => (
          <EntryCard key={index} entry={entry} />
        ))}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Escribí tu pedido..."
          editable={!busy}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={busy || !text.trim()}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Enviar</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EntryCard({ entry }: { entry: Entry }) {
  const isOk = entry.status === 'EXECUTED' && entry.result?.status === 'SUCCESS';
  return (
    <View style={styles.entry}>
      <Text style={styles.instructionText}>"{entry.instruction}"</Text>

      {entry.status !== 'EXECUTED' && (
        <View style={[styles.box, styles.boxInfo]}>
          <Text style={styles.boxLabel}>{labelFor(entry.status)}</Text>
          <Text style={styles.boxMessage}>{entry.message}</Text>
        </View>
      )}

      {entry.status === 'EXECUTED' && entry.command && (
        <View style={styles.commandBox}>
          <Text style={styles.commandLabel}>Comando generado</Text>
          <Text style={styles.commandText}>{JSON.stringify(entry.command)}</Text>
        </View>
      )}

      {entry.status === 'EXECUTED' && entry.result && (
        <View style={[styles.box, isOk ? styles.boxOk : styles.boxError]}>
          <Text style={styles.boxLabel}>{entry.result.status}</Text>
          {entry.result.message && <Text style={styles.boxMessage}>{entry.result.message}</Text>}
          {entry.result.diagnostics && <Text style={styles.boxMessage}>{entry.result.diagnostics.map((d) => d.message).join(' ')}</Text>}
        </View>
      )}
    </View>
  );
}

function labelFor(status: Entry['status']): string {
  switch (status) {
    case 'CLARIFICATION_REQUIRED':
      return 'Necesito más información';
    case 'INVALID_REQUEST':
      return 'No se pudo interpretar';
    case 'NOT_CONFIGURED':
      return 'Asistente no disponible';
    case 'AI_ERROR':
      return 'Error';
    default:
      return status;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, paddingBottom: 12 },
  back: { color: '#2563eb', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 12, color: '#888', marginTop: 4 },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingTop: 0, gap: 16 },
  entry: { gap: 6 },
  instructionText: { fontSize: 15, fontWeight: '600', color: '#111' },
  commandBox: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10 },
  commandLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  commandText: { fontSize: 12, fontFamily: 'monospace', color: '#333' },
  box: { borderRadius: 8, padding: 10, borderWidth: 1 },
  boxInfo: { borderColor: '#ccc', backgroundColor: '#f9fafb' },
  boxOk: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  boxError: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  boxLabel: { fontWeight: '700', fontSize: 13 },
  boxMessage: { fontSize: 13, color: '#333', marginTop: 2 },
  inputRow: { flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: '#e5e5e5', alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 15, maxHeight: 100 },
  sendButton: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 18 },
  sendText: { color: '#fff', fontWeight: '600' },
});
