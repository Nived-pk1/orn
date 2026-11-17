/** The not-found screen (step 8.4g, G7): a bad address, or a record this version does not have. The EmptyState look; one way out. */
import { EmptyState } from '@/ui/primitives';

export function NotFound(props: { readonly what: 'bad' | 'missing'; readonly onChapters: () => void }) {
  return (
    <EmptyState action={{ label: 'Go to Chapters', onClick: props.onChapters }}>
      {props.what === 'bad' ? 'This page does not exist.' : 'This record is not in this version of the app.'}
    </EmptyState>
  );
}
