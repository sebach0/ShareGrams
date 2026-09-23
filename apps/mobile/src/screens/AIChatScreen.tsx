import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { interpretInstruction } from '../ai/aiCommandInterpreter';
import { buildKnownRecords } from '../ai/knownRecords';
import { coerceAiCommand } from '../ai/coerceAiCommand';
import { runDynamicCommand } from '../engine/runDynamicCommand';
import { useSpeechToText } from '../speech/useSpeechToText';
import type { CommandResult } from '../engine/commandResult';
import type { DomainManifest } from '../domain/manifest';
import type { DynamicDataSource } from '../offline/dynamicDataSource';

interface Props {
  dataSource: DynamicDataSource;
  baseUrl: string;
  manifest: DomainManifest;
  onBack: () => void;
}

type Entry = {
  instruction: string;
  status: 'CLARIFICATION_REQUIRED' | 'INVALID_REQUEST' | 'AI_ERROR' | 'NOT_CONFIGURED' | 'CANCELLED' | 'EXECUTED';
  message: string;
  command?: Record<string, unknown>;
  result?: CommandResult;
};

/** Por debajo de esto, avisamos al usuario que revise el texto antes de mandarlo (regla 14 de Fase 16). */
const LOW_CONFIDENCE_THRESHOLD = 0.6;

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
export function AIChatScreen({ dataSource, baseUrl, manifest, onBack }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lowConfidenceNotice, setLowConfidenceNotice] = useState<string | null>(null);
  const speech = useSpeechToText();

  const handleMicPress = async () => {
    if (speech.state === 'listening' || speech.state === 'processing') {
      speech.cancel();
      return;
    }
    setLowConfidenceNotice(null);
    const result = await speech.listen();
    if (!result) return; // el error queda expuesto vía speech.error, se muestra abajo
    // Regla 14/15 de Fase 16: la voz SOLO llena el input -- el usuario sigue
    // teniendo que revisar y tocar "Enviar" él mismo, igual que en Fase 6 (web).
    setText(result.text);
    if (result.confidence !== null && result.confidence < LOW_CONFIDENCE_THRESHOLD) {
      setLowConfidenceNotice(`Confianza baja (${Math.round(result.confidence * 100)}%) -- revisá el texto antes de enviar.`);
    }
  };

  const handleSend = async () => {
    const instruction = text.trim();
    if (!instruction) return;
    setText('');
    setLowConfidenceNotice(null);
    setBusy(true);

    const knownRecords = await buildKnownRecords(manifest, dataSource);
    const aiResult = await interpretInstruction(instruction, manifest, fetch, knownRecords);

    if (aiResult.status !== 'COMMAND') {
      setEntries((prev) => [...prev, { instruction, status: aiResult.status, message: aiResult.message }]);
      setBusy(false);
      return;
    }

    if (aiResult.command.action === 'DELETE' && !(await confirmDelete(aiResult.command))) {
      setEntries((prev) => [...prev, { instruction, status: 'CANCELLED', message: 'Cancelado por el usuario.', command: aiResult.command }]);
      setBusy(false);
      return;
    }

    const coerced = coerceAiCommand(aiResult.command, manifest);
    const result = await runDynamicCommand(coerced, manifest, dataSource);

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
        <Text style={styles.subtitle}>Escribí o dictá un pedido en lenguaje natural, ej. "Creá un {manifest.entities[0]?.label ?? 'registro'} llamado..."</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {entries.map((entry, index) => (
          <EntryCard key={index} entry={entry} />
        ))}
      </ScrollView>

      {(speech.state === 'listening' || speech.state === 'processing') && (
        <Text style={styles.speechStatus}>{speech.state === 'listening' ? '🎙️ Escuchando...' : '⏳ Procesando audio...'}</Text>
      )}
      {speech.state === 'error' && speech.error && <Text style={styles.speechError}>{speech.error.message}</Text>}
      {lowConfidenceNotice && <Text style={styles.speechWarning}>{lowConfidenceNotice}</Text>}

      <View style={styles.inputRow}>
        <TouchableOpacity
          style={[styles.micButton, speech.state === 'listening' && styles.micButtonActive]}
          onPress={handleMicPress}
          disabled={busy}
        >
          <Text style={styles.micIcon}>🎤</Text>
        </TouchableOpacity>
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

/**
 * Confirmación explícita antes de ejecutar un DELETE (regla 15 de Fase 16
 * -- especialmente importante viniendo de voz, pero se aplica siempre,
 * escrito o dictado, mismo criterio que ya usa DynamicEntityDetailScreen
 * para el borrado manual).
 */
function confirmDelete(command: Record<string, unknown>): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Confirmar eliminación',
      `Voy a ejecutar: eliminar ${command.entity} ${command.id ?? ''}.\n¿Confirmar?`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Confirmar', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
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

      {(entry.status === 'EXECUTED' || entry.status === 'CANCELLED') && entry.command && (
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
    case 'CANCELLED':
      return 'Cancelado';
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
  micButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  micButtonActive: { backgroundColor: '#fee2e2', borderColor: '#dc2626' },
  micIcon: { fontSize: 20 },
  speechStatus: { fontSize: 13, color: '#2563eb', paddingHorizontal: 20, paddingBottom: 4 },
  speechError: { fontSize: 13, color: '#dc2626', paddingHorizontal: 20, paddingBottom: 4 },
  speechWarning: { fontSize: 13, color: '#b45309', paddingHorizontal: 20, paddingBottom: 4 },
});
