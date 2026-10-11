/**
 * Condition parameters as short phrases for the inspector (step 5.6a). Presentation only: a value is written the way it is stored;
 * nothing is converted or judged. Fields that are absent are not written; the stored free text and "other" entries always are.
 */
import type { ConditionParameters } from '@/core/schema';

type Measure = { readonly kind: string; readonly value?: unknown; readonly unit?: unknown; readonly min?: unknown; readonly max?: unknown };
const words = (value: unknown): string => String(value).replaceAll('_', ' ');

function measure(label: string, m: Measure | undefined): string | undefined {
  if (m === undefined) return undefined;
  if (m.kind === 'value') return `${label} ${String(m.value)} ${String(m.unit)}`;
  if (m.kind === 'range') return `${label} ${String(m.min)} to ${String(m.max)} ${String(m.unit)}`;
  return `${label} ${words(m.value)}`;
}

export function parameterPhrases(p: ConditionParameters): string[] {
  const out: (string | undefined)[] = [
    measure('temperature', p.temperature),
    measure('pressure', p.pressure),
    measure('time', p.time),
    p.medium === undefined ? undefined : `${p.medium} medium`,
    p.solventCharacter.length === 0 ? undefined : `solvent ${p.solventCharacter.map(words).join(', ')}`,
    p.anhydrous === undefined ? undefined : p.anhydrous ? 'anhydrous' : 'not anhydrous',
    p.light === undefined ? undefined : `light ${words(p.light)}`,
    p.atmosphere === undefined ? undefined : `atmosphere ${words(p.atmosphere)}`,
    p.activation.length === 0 ? undefined : `activation ${p.activation.map(words).join(', ')}`,
    ...p.other,
    p.text === undefined ? undefined : `as written: ${p.text}`,
  ];
  return out.filter((phrase): phrase is string => phrase !== undefined);
}
