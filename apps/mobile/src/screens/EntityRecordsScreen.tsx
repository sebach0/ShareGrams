import { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { DomainManifest, EntityDefinition } from '../domain/manifest';
import { useEntityRecords } from '../state/useEntityRecords';
import { EntityCreateScreen } from './EntityCreateScreen';

interface Props {
  baseUrl: string;
  manifest: DomainManifest;
  entity: EntityDefinition;
  onBack: () => void;
}

/**
 * Lista + alta de UNA entidad (regla 2/45: cero referencias a un dominio
 * puntual -- todo sale de `entity`). "Crear y listar" es el alcance
 * confirmado para este primer corte de Fase 13; editar/borrar/voz quedan
 * para después.
 */
export function EntityRecordsScreen({ baseUrl, manifest, entity, onBack }: Props) {
  const { state, reload } = useEntityRecords(baseUrl, entity);
  const [showCreate, setShowCreate] = useState(false);
  const canCreate = entity.operations.includes('CREATE');
  const idFieldName = entity.id?.fields[0]?.name;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← {manifest.application.name}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{entity.pluralLabel}</Text>
      </View>

      {state.status === 'loading' && <ActivityIndicator style={styles.spinner} />}
      {state.status === 'error' && <Text style={styles.error}>{state.message}</Text>}
      {state.status === 'loaded' && (
        <ScrollView contentContainerStyle={styles.list}>
          {state.records.length === 0 && (
            <Text style={styles.empty}>Todavía no hay {entity.pluralLabel.toLowerCase()}.</Text>
          )}
          {state.records.map((record, index) => (
            <RecordCard key={String(idFieldName ? (record.values[idFieldName] ?? index) : index)} record={record} entity={entity} />
          ))}
        </ScrollView>
      )}

      {canCreate && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
          <Text style={styles.fabText}>+ Nuevo</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showCreate} animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <EntityCreateScreen
          baseUrl={baseUrl}
          manifest={manifest}
          entity={entity}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </View>
  );
}

function RecordCard({ record, entity }: { record: DynamicEntity; entity: EntityDefinition }) {
  const title = String(record.values[entity.displayField] ?? '(sin nombre)');
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {entity.fields
        .filter((field) => field.name !== entity.displayField)
        .map((field) => (
          <Text key={field.name} style={styles.cardLine}>
            {field.label}: {formatValue(record.values[field.name])}
          </Text>
        ))}
    </View>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, paddingBottom: 8 },
  back: { color: '#2563eb', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  spinner: { marginTop: 24 },
  error: { color: '#dc2626', paddingHorizontal: 20 },
  list: { padding: 20, paddingTop: 8, gap: 8 },
  empty: { color: '#888', fontSize: 14 },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  cardLine: { fontSize: 13, color: '#555' },
  fab: { position: 'absolute', right: 20, bottom: 24, backgroundColor: '#2563eb', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 22 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
