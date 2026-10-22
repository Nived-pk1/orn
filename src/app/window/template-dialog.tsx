/**
 * The question before a copy or a specific reaction starts (step 6.7a decisions C2 and C3): one line saying what the new draft is and,
 * for a copy, what is not copied. Nothing is saved by asking; "Start" opens the new draft in the editor. Loaded with `React.lazy` by
 * `editors.tsx`, so it is not in the entry chunk.
 */
import { Button, Dialog } from '@/ui/primitives';

export type TemplateMode = 'duplicate' | 'specific';

export const TEMPLATE_WORDS: Readonly<Record<TemplateMode, { readonly title: string; readonly start: string; readonly line: (name: string) => string }>> = {
  duplicate: {
    title: 'Duplicate reaction',
    start: 'Start the copy',
    line: (name) => `A copy of ${name} starts as a new draft. Relationships, topic mappings, exam relevance and caveats that point at the original are not copied.`,
  },
  specific: {
    title: 'New specific reaction',
    start: 'Start the specific reaction',
    line: (name) => `A specific reaction starts from ${name}, with a place to choose a species for each class. Nothing is saved until you save it.`,
  },
};

export function TemplateDialog(props: { readonly mode: TemplateMode; readonly name: string; readonly onStart: () => void; readonly onCancel: () => void }) {
  const words = TEMPLATE_WORDS[props.mode];
  return (
    <Dialog
      open
      onClose={props.onCancel}
      title={words.title}
      footer={
        <>
          <Button variant="primary" onClick={props.onStart}>
            {words.start}
          </Button>
          <Button onClick={props.onCancel}>Cancel</Button>
        </>
      }
    >
      <p>{words.line(props.name)}</p>
    </Dialog>
  );
}
