import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import type { DomainManifest, RelationDefinition } from '../domain/manifest';
import type { DynamicDataSource } from '../offline/dynamicDataSource';

interface Props {
  dataSource: DynamicDataSource;
  manifest: DomainManifest;
  relation: RelationDefinition;
  value: unknown;
}

type State = { status: 'loading' } | { status: 'loaded'; label: string } | { status: 'error' };

/**
 * Muestra el VALOR de una relación en la pantalla de detalle: internamente
 * es un id (regla 31 -- "Carlos Perez" visualmente, ID = 5 por dentro), acá
 * se resuelve ese id contra el backend conectado (GET de la entidad
 * destino) para mostrar su `displayField` en vez de un número pelado.
 * Para MANY_TO_MANY (un array de ids) no intenta resolver cada uno -- se
 * muestra la cantidad, mismo criterio de "no sobreingenierizar" que ya
 * aplicó el formulario (regla 36: M:N queda de solo lectura/documentado).
 */
export function RelationValue({ dataSource, manifest, relation, value }: Props) {
  const targetEntity = manifest.entities.find((e) => e.name === relation.targetEntity);
  const isToMany = relation.cardinality === 'MANY_TO_MANY';
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (isToMany || value === null || value === undefined || !targetEntity?.id) return;
    let cancelled = false;
    setState({ status: 'loading' });

    dataSource.get(targetEntity, value as string | number).then((result) => {
      if (cancelled) return;
      if (result.kind === 'ok') {
        setState({ status: 'loaded', label: String(result.value.values[targetEntity.displayField] ?? value) });
      } else {
        setState({ status: 'error' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dataSource, targetEntity, value, isToMany]);

  if (isToMany) {
    const count = Array.isArray(value) ? value.length : 0;
    return <Text style={styles.text}>{count} {count === 1 ? 'relacionado' : 'relacionados'}</Text>;
  }

  if (value === null || value === undefined) return <Text style={styles.text}>—</Text>;
  if (!targetEntity?.id) return <Text style={styles.text}>{String(value)}</Text>;

  if (state.status === 'loading') return <ActivityIndicator size="small" />;
  if (state.status === 'error') return <Text style={styles.text}>{String(value)}</Text>;
  return <Text style={styles.text}>{state.label}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 16, color: '#333' },
});
