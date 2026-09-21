import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { runDynamicCommand } from '../engine/runDynamicCommand';
import { DynamicRepository } from '../engine/dynamicRepository';
import type { DynamicEntity } from '../engine/dynamicEntity';
import type { DynamicId } from '../engine/dynamicCommand';
import type { DomainManifest, EntityDefinition, FieldDefinition } from '../domain/manifest';
import { RelationPicker } from '../components/RelationPicker';

interface Props {
  baseUrl: string;
  manifest: DomainManifest;
  entity: EntityDefinition;
  /** Ausente = CREATE; presente = EDIT, precarga el formulario con sus valores (regla 15-17: mismo componente, no dos formularios separados). */
  initialRecord?: DynamicEntity;
  onSaved: (record: DynamicEntity) => void;
  onCancel: () => void;
}

/**
 * MVP de Fase 13/14 (confirmado con el usuario): solo relaciones simples
 * (MANY_TO_ONE/ONE_TO_ONE, un único id) tienen selector acá. ONE_TO_MANY y
 * MANY_TO_MANY quedan afuera de este formulario -- se listan como nota, no
 * se ocultan en silencio (mismo criterio que las limitaciones documentadas
 * de Fase 10/11: nunca fingir que algo funciona cuando no).
 */
const EDITABLE_RELATION_CARDINALITIES = new Set(['MANY_TO_ONE', 'ONE_TO_ONE']);

function initialTextValues(entity: EntityDefinition, record: DynamicEntity | undefined): Record<string, string> {
  if (!record) return {};
  const values: Record<string, string> = {};
  for (const field of entity.fields) {
    const raw = record.values[field.name];
    if (raw !== undefined && raw !== null) values[field.name] = field.type === 'boolean' ? String(raw) : String(raw);
  }
  return values;
}

function initialRelationValues(entity: EntityDefinition, record: DynamicEntity | undefined): Record<string, unknown> {
  if (!record) return {};
  const values: Record<string, unknown> = {};
  for (const relation of entity.relations) {
    const raw = record.values[relation.name];
    if (raw !== undefined && raw !== null) values[relation.name] = raw;
  }
  return values;
}

export function DynamicEntityFormScreen({ baseUrl, manifest, entity, initialRecord, onSaved, onCancel }: Props) {
  const mode: 'create' | 'edit' = initialRecord ? 'edit' : 'create';

  const editableFields = useMemo(() => entity.fields.filter((f) => f.editable && !f.generated), [entity]);
  const editableRelations = useMemo(
    () => entity.relations.filter((r) => EDITABLE_RELATION_CARDINALITIES.has(r.cardinality)),
    [entity],
  );
  const skippedRelations = useMemo(
    () => entity.relations.filter((r) => !EDITABLE_RELATION_CARDINALITIES.has(r.cardinality)),
    [entity],
  );

  const [values, setValues] = useState<Record<string, string>>(() => initialTextValues(entity, initialRecord));
  const [relationValues, setRelationValues] = useState<Record<string, unknown>>(() => initialRelationValues(entity, initialRecord));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (name: string, text: string) => setValues((v) => ({ ...v, [name]: text }));

  const handleSubmit = async () => {
    setError(null);

    // Las validaciones de "required"/tipo/enum/relación NO se repiten acá a
    // mano (regla 27/43 de Fase 13): el mismo CommandValidator que corre
    // para Claude en una fase futura es el que decide si esto se puede
    // mandar o no. Solo se arma el `data` crudo; si falta algo, el
    // Validator lo va a rechazar con un diagnóstico legible antes de tocar
    // la red.
    const data: Record<string, unknown> = {};
    for (const field of editableFields) {
      const value = coerceValue(values[field.name], field);
      if (value !== null) data[field.name] = value;
    }
    for (const relation of editableRelations) {
      if (relationValues[relation.name] !== undefined) data[relation.name] = relationValues[relation.name];
    }

    setSubmitting(true);
    const repository = new DynamicRepository(baseUrl);
    const command =
      mode === 'edit'
        ? { action: 'UPDATE' as const, entity: entity.name, id: idOf(entity, initialRecord!), data }
        : { action: 'CREATE' as const, entity: entity.name, data };
    const result = await runDynamicCommand(command, manifest, repository);
    setSubmitting(false);

    if (result.status === 'SUCCESS') {
      onSaved(result.data as DynamicEntity);
    } else {
      setError(result.diagnostics?.[0]?.message ?? result.message ?? 'No se pudo guardar.');
    }
  };

  return (
    // Este componente siempre se monta dentro de un <Modal> (ver
    // EntityRecordsScreen/DynamicEntityDetailScreen): Modal de React Native
    // renderiza en una superficie nativa aparte, así que el SafeAreaView de
    // App.tsx NO aplica acá adentro -- necesita el suyo propio, si no el
    // título queda tapado por la barra de estado (bug real, encontrado
    // probando en un emulador real).
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{mode === 'edit' ? `Editar ${entity.label}` : `Nuevo/a ${entity.label}`}</Text>

      {editableFields.map((field) => (
        <FieldInput key={field.name} field={field} value={values[field.name] ?? ''} onChange={(t) => setField(field.name, t)} />
      ))}

      {editableRelations.map((relation) => (
        <RelationPicker
          key={relation.name}
          baseUrl={baseUrl}
          manifest={manifest}
          relation={relation}
          selectedId={relationValues[relation.name]}
          onSelect={(id) => setRelationValues((v) => ({ ...v, [relation.name]: id }))}
        />
      ))}

      {skippedRelations.length > 0 && (
        <Text style={styles.note}>No editable todavía desde la app: {skippedRelations.map((r) => r.name).join(', ')}.</Text>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={submitting}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Guardar</Text>}
        </TouchableOpacity>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function idOf(entity: EntityDefinition, record: DynamicEntity): DynamicId {
  const idFieldName = entity.id?.fields[0]?.name;
  const value = idFieldName ? record.values[idFieldName] : undefined;
  return value as DynamicId;
}

function FieldInput({ field, value, onChange }: { field: FieldDefinition; value: string; onChange: (t: string) => void }) {
  if (field.type === 'boolean') {
    return (
      <View style={styles.switchRow}>
        <Text style={styles.label}>{field.label}</Text>
        <Switch value={value === 'true'} onValueChange={(v) => onChange(String(v))} />
      </View>
    );
  }
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{field.label}{field.required ? ' *' : ''}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        keyboardType={isNumericType(field.type) ? 'numeric' : 'default'}
        placeholder={placeholderFor(field)}
      />
    </View>
  );
}

function isNumericType(type: FieldDefinition['type']): boolean {
  return type === 'integer' || type === 'long' || type === 'decimal';
}

function placeholderFor(field: FieldDefinition): string | undefined {
  if (field.type === 'date') return 'AAAA-MM-DD';
  if (field.type === 'datetime') return 'AAAA-MM-DDTHH:mm:ss';
  return undefined;
}

function coerceValue(raw: string | undefined, field: FieldDefinition): unknown {
  if (field.type === 'boolean') return raw === 'true';
  if (raw === undefined || raw.trim() === '') return null;
  if (field.type === 'integer' || field.type === 'long') {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : raw;
  }
  if (field.type === 'decimal') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 20, gap: 4, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  note: { fontSize: 12, color: '#888', marginBottom: 12 },
  error: { color: '#dc2626', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelButton: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', alignItems: 'center' },
  cancelText: { color: '#333', fontWeight: '600' },
  submitButton: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '600' },
});
