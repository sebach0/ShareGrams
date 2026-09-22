import { useState } from 'react';
import { ActivityIndicator, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { DomainManifest, EntityDefinition } from '../domain/manifest';
import { useEntityRecords } from '../state/useEntityRecords';
import { DynamicEntityFormScreen } from './DynamicEntityFormScreen';
import type { DynamicDataSource } from '../offline/dynamicDataSource';
import { isLocalId } from '../offline/localId';

interface Props {
  dataSource: DynamicDataSource;
  manifest: DomainManifest;
  entity: EntityDefinition;
  onBack: () => void;
  /** El detalle vive un nivel arriba (App.tsx), para que "volver" desde ahí no dependa de esta pantalla seguir montada. */
  onSelectRecord: (record: DynamicEntity) => void;
}

/**
 * DynamicEntityList (regla 9/10): lista + alta de CUALQUIER entidad
 * descubierta -- cero referencias a un dominio puntual, todo sale de
 * `entity`. Cada tarjeta solo muestra `displayField` (regla 10/11): el
 * detalle completo vive en DynamicEntityDetailScreen, a un toque de acá.
 */
export function EntityRecordsScreen({ dataSource, manifest, entity, onBack, onSelectRecord }: Props) {
  const { state, reload } = useEntityRecords(dataSource, entity);
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
      {state.status === 'error' && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>No fue posible conectar con el servidor.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={reload}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}
      {state.status === 'loaded' && (
        <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}>
          {state.records.length === 0 && (
            <View>
              <Text style={styles.empty}>No existen registros.</Text>
              {canCreate && (
                <TouchableOpacity style={styles.emptyCreateButton} onPress={() => setShowCreate(true)}>
                  <Text style={styles.emptyCreateText}>Crear nuevo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {state.records.map((record, index) => (
            <RecordCard
              key={String(idFieldName ? (record.values[idFieldName] ?? index) : index)}
              record={record}
              entity={entity}
              onPress={() => onSelectRecord(record)}
            />
          ))}
        </ScrollView>
      )}

      {canCreate && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
          <Text style={styles.fabText}>+ Nuevo</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showCreate} animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <DynamicEntityFormScreen
          dataSource={dataSource}
          manifest={manifest}
          entity={entity}
          onSaved={() => {
            setShowCreate(false);
            reload();
          }}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </View>
  );
}

function RecordCard({ record, entity, onPress }: { record: DynamicEntity; entity: EntityDefinition; onPress: () => void }) {
  const title = String(record.values[entity.displayField] ?? '(sin nombre)');
  const idField = entity.id?.fields[0]?.name;
  const pendingSync = idField ? isLocalId(record.values[idField]) : false;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <Text style={styles.cardTitle}>{title}</Text>
      {pendingSync && <Text style={styles.pendingBadge}>☁ Pendiente de sincronizar</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, paddingBottom: 8 },
  back: { color: '#2563eb', fontSize: 14, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  spinner: { marginTop: 24 },
  errorBox: { padding: 20, gap: 12 },
  error: { color: '#dc2626' },
  retryButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#dc2626', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  retryText: { color: '#dc2626', fontWeight: '600' },
  list: { padding: 20, paddingTop: 8, gap: 8 },
  empty: { color: '#888', fontSize: 14, marginBottom: 12 },
  emptyCreateButton: { alignSelf: 'flex-start', backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
  emptyCreateText: { color: '#fff', fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  pendingBadge: { fontSize: 12, color: '#b45309', marginTop: 4 },
  fab: { position: 'absolute', right: 20, bottom: 24, backgroundColor: '#2563eb', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 22 },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
