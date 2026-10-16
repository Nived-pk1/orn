import { RECORD_KINDS, type RecordKind } from '@/core/schema';

/** How many records of each kind are in the dataset (the Dataset view and, on a phone, the More menu). */
export function RecordCounts(props: { readonly counts: Readonly<Record<RecordKind, number>> }) {
  const present = RECORD_KINDS.filter((kind) => props.counts[kind] > 0);
  if (present.length === 0) return <p>The dataset is empty.</p>;
  return (
    <ul aria-label="Record counts">
      {present.map((kind) => (
        <li key={kind}>
          {kind.replaceAll('_', ' ')}: {props.counts[kind]}
        </li>
      ))}
    </ul>
  );
}
