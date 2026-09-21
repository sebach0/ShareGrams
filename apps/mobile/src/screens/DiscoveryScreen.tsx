import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { DomainManifest, EntityDefinition } from '../domain/manifest';

interface Props {
  url: string;
  manifest: DomainManifest;
  onDisconnect: () => void;
  onSelectEntity: (entity: EntityDefinition) => void;
}

/**
 * Punto de entrada a los datos de CUALQUIER backend descubierto (regla 31,
 * ahora también puerta a Fase 13): las mismas clases (ConnectScreen/
 * DiscoveryScreen) no cambian entre un backend de Ventas y uno de Clínica
 * -- lo único que cambia es el `manifest` que reciben. Tocar una tarjeta
 * navega a EntityRecordsScreen (lista + alta) para esa entidad.
 */
export function DiscoveryScreen({ url, manifest, onDisconnect, onSelectEntity }: Props) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.appName}>{manifest.application.name}</Text>
      <Text style={styles.url}>{url}</Text>

      <Text style={styles.sectionTitle}>Entidades detectadas ({manifest.entities.length})</Text>
      {manifest.entities.map((entity) => (
        <EntityCard key={entity.name} entity={entity} onPress={() => onSelectEntity(entity)} />
      ))}

      <TouchableOpacity style={styles.disconnectButton} onPress={onDisconnect}>
        <Text style={styles.disconnectText}>Desconectar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function EntityCard({ entity, onPress }: { entity: EntityDefinition; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <Text style={styles.entityName}>{entity.label}</Text>
      <Text style={styles.entityMeta}>{entity.endpoint} · {entity.operations.join(', ')}</Text>

      {entity.id && (
        <Text style={styles.line}>
          🔑 {entity.id.fields.map((f) => `${f.name}: ${f.type}`).join(', ')}
        </Text>
      )}

      {entity.fields.map((field) => (
        <Text key={field.name} style={styles.line}>
          - {field.name}: {field.type}{field.required ? ' (requerido)' : ''}
        </Text>
      ))}

      {entity.relations.map((relation) => (
        <Text key={relation.name} style={styles.relationLine}>
          → {relation.name} → {relation.targetEntity} ({relation.cardinality})
        </Text>
      ))}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 20, gap: 8 },
  appName: { fontSize: 24, fontWeight: '700' },
  url: { fontSize: 13, color: '#666', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  card: { borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 10, padding: 14, marginBottom: 12 },
  entityName: { fontSize: 18, fontWeight: '700' },
  entityMeta: { fontSize: 12, color: '#888', marginBottom: 8 },
  line: { fontSize: 14, color: '#333' },
  relationLine: { fontSize: 14, color: '#2563eb' },
  disconnectButton: { marginTop: 12, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#dc2626', alignItems: 'center' },
  disconnectText: { color: '#dc2626', fontWeight: '600' },
});
