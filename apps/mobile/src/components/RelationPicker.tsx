import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { repositoryErrorMessage } from '../engine/dynamicRepository';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { DomainManifest, RelationDefinition } from '../domain/manifest';
import type { DynamicDataSource } from '../offline/dynamicDataSource';

interface Props {
  dataSource: DynamicDataSource;
  manifest: DomainManifest;
  relation: RelationDefinition;
  selectedId: unknown;
  onSelect: (id: unknown) => void;
}

type PickerState = { status: 'loading' } | { status: 'loaded'; records: DynamicEntity[] } | { status: 'error'; message: string };

/**
 * Selector para una relación MANY_TO_ONE/ONE_TO_ONE (ver EntityCreateScreen:
 * las únicas cardinalidades que este MVP de Fase 13 sabe completar al crear).
 * Trae la lista de la entidad destino desde el MISMO backend conectado y
 * deja elegir un registro por su `displayField` -- nunca pide al usuario que
 * escriba un id a mano.
 */
export function RelationPicker({ dataSource, manifest, relation, selectedId, onSelect }: Props) {
  const targetEntity = manifest.entities.find((e) => e.name === relation.targetEntity);
  const [state, setState] = useState<PickerState>({ status: 'loading' });

  useEffect(() => {
    if (!targetEntity) return;
    let cancelled = false;
    setState({ status: 'loading' });

    dataSource.list(targetEntity).then((result) => {
      if (cancelled) return;
      setState(result.kind === 'ok' ? { status: 'loaded', records: result.value } : { status: 'error', message: repositoryErrorMessage(result) });
    });

    return () => {
      cancelled = true;
    };
  }, [dataSource, targetEntity]);

  if (!targetEntity || !targetEntity.id) {
    return (
      <View style={styles.group}>
        <Text style={styles.label}>{relation.name}</Text>
        <Text style={styles.error}>Esta relación no se puede completar todavía desde la app.</Text>
      </View>
    );
  }

  const idFieldName = targetEntity.id.fields[0].name;

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{relation.name}{relation.required ? ' *' : ''}</Text>

      {state.status === 'loading' && <ActivityIndicator />}
      {state.status === 'error' && <Text style={styles.error}>{state.message}</Text>}
      {state.status === 'loaded' && state.records.length === 0 && (
        <Text style={styles.empty}>No hay {targetEntity.pluralLabel.toLowerCase()} todavía -- creá uno primero.</Text>
      )}
      {state.status === 'loaded' && state.records.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {state.records.map((record) => {
            const id = record.values[idFieldName];
            const label = String(record.values[targetEntity.displayField] ?? id);
            const selected = selectedId === id;
            return (
              <TouchableOpacity
                key={String(id)}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => onSelect(id)}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  error: { color: '#dc2626', fontSize: 13 },
  empty: { color: '#888', fontSize: 13 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { color: '#333', fontSize: 14 },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
});
