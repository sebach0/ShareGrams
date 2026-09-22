import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { runDynamicCommand } from '../engine/runDynamicCommand';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { DynamicId } from '../engine/dynamicCommand';
import type { DomainManifest, EntityDefinition } from '../domain/manifest';
import { formatFieldValue } from '../domain/fieldDisplay';
import { RelationValue } from '../components/RelationValue';
import { DynamicEntityFormScreen } from './DynamicEntityFormScreen';
import type { DynamicDataSource } from '../offline/dynamicDataSource';
import { isLocalId } from '../offline/localId';

interface Props {
  dataSource: DynamicDataSource;
  manifest: DomainManifest;
  entity: EntityDefinition;
  record: DynamicEntity;
  /** Vuelve a la lista de esta entidad. Al desmontar este detalle y volver a montar EntityRecordsScreen, la lista se recarga sola -- no hace falta un callback aparte para "algo cambió". */
  onBack: () => void;
}

/**
 * DynamicEntityDetail (regla 13): recibe EntityDefinition + DynamicEntity y
 * muestra sus campos con el mismo renderer que usa la lista -- cero lógica
 * por dominio. "Editar"/"Eliminar" solo aparecen si el Manifest declara esa
 * operación para esta entidad (regla 40/42/43).
 */
export function DynamicEntityDetailScreen({ dataSource, manifest, entity, record, onBack }: Props) {
  const [showEdit, setShowEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUpdate = entity.operations.includes('UPDATE');
  const canDelete = entity.operations.includes('DELETE');
  const title = String(record.values[entity.displayField] ?? entity.label);
  const idFieldName = entity.id?.fields[0]?.name;
  const pendingSync = idFieldName ? isLocalId(record.values[idFieldName]) : false;

  const handleDelete = () => {
    const id = idOf(entity, record);
    if (id === undefined) return;
    Alert.alert(`Eliminar ${entity.label}`, `¿Seguro que querés eliminar "${title}"? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setDeleting(true);
          const result = await runDynamicCommand({ action: 'DELETE', entity: entity.name, id }, manifest, dataSource);
          setDeleting(false);
          if (result.status === 'SUCCESS') {
            onBack();
          } else {
            setError(result.diagnostics?.[0]?.message ?? result.message ?? 'No se pudo eliminar.');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← {entity.pluralLabel}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        {pendingSync && <Text style={styles.pendingBadge}>☁ Pendiente de sincronizar</Text>}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {entity.fields.map((field) => (
          <View key={field.name} style={styles.row}>
            <Text style={styles.label}>{field.label}</Text>
            <Text style={styles.value}>{formatFieldValue(record.values[field.name], field)}</Text>
          </View>
        ))}

        {entity.relations.map((relation) => (
          <View key={relation.name} style={styles.row}>
            <Text style={styles.label}>{relation.name}</Text>
            <RelationValue dataSource={dataSource} manifest={manifest} relation={relation} value={record.values[relation.name]} />
          </View>
        ))}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          {canUpdate && (
            <TouchableOpacity style={styles.editButton} onPress={() => setShowEdit(true)}>
              <Text style={styles.editText}>Editar</Text>
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={deleting}>
              {deleting ? <ActivityIndicator color="#dc2626" /> : <Text style={styles.deleteText}>Eliminar</Text>}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal visible={showEdit} animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <DynamicEntityFormScreen
          dataSource={dataSource}
          manifest={manifest}
          entity={entity}
          initialRecord={record}
          onSaved={() => {
            setShowEdit(false);
            onBack();
          }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>
    </View>
  );
}

function idOf(entity: EntityDefinition, record: DynamicEntity): DynamicId | undefined {
  const idFieldName = entity.id?.fields[0]?.name;
  return idFieldName ? (record.values[idFieldName] as DynamicId) : undefined;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, paddingBottom: 8 },
  back: { color: '#2563eb', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  pendingBadge: { fontSize: 13, color: '#b45309', marginTop: 4 },
  body: { padding: 20, paddingTop: 8, gap: 4 },
  row: { marginBottom: 14 },
  label: { fontSize: 12, color: '#888', marginBottom: 2 },
  value: { fontSize: 16, color: '#333' },
  error: { color: '#dc2626', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  editButton: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  editText: { color: '#fff', fontWeight: '600' },
  deleteButton: { flex: 1, borderRadius: 8, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#dc2626' },
  deleteText: { color: '#dc2626', fontWeight: '600' },
});
