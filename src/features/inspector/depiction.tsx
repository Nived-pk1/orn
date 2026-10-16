/**
 * A structure in the inspector (step 5.6a): the shared depiction binding at the inspector's size, asked while the picture is mounted.
 * Without a depiction port, or while the engine has not answered, the formula and name are shown instead (a species always has a
 * readable line). The picture is an `<img>` from a blob: URL made by the port; the SVG text is never put in the page.
 */
import { useMemo } from 'react';
import type { StructureRep } from '@/core/schema';
import { createDepictionBinding, drawingFailed, useRetryingDepiction } from '@/render/svg';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';

export const INSPECTOR_STRUCTURE = { width: 256, height: 160 } as const;
/** A structure inside a mechanism step: at most 120 x 80 px (review of step 5.6b). */
export const STEP_STRUCTURE = { width: 120, height: 80 } as const;

export function Depiction(props: { readonly structure: StructureRep | undefined; readonly name: string; readonly fallback?: string; readonly compact?: boolean }) {
  const { ports } = useInspectorEnv();
  const compact = props.compact === true;
  const binding = useMemo(() => (ports.depictions === undefined ? undefined : createDepictionBinding(ports.depictions, ports.timers, compact ? STEP_STRUCTURE : INSPECTOR_STRUCTURE)), [ports, compact]);
  const key = props.structure === undefined ? undefined : binding?.keyOf(props.structure);
  const status = useRetryingDepiction(binding?.manager, key, ports.timers);
  if (props.structure === undefined) return null;
  if (status.state === 'ready') return <img className={compact ? styles.stepStructure : styles.structure} src={status.url} alt={`Structure of ${props.name}`} />;
  const why = drawingFailed(status) ? 'The structure could not be drawn.' : binding === undefined ? 'No structure is drawn here.' : 'Drawing the structure.';
  return (
    <p className={styles.muted} role="status">
      {why} {props.fallback ?? ''}
    </p>
  );
}
