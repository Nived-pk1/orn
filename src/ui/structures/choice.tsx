/**
 * What a page header that draws species carries (step 8.5h B1): the app-wide Structures setting as a segmented control, or as the one
 * "Structures: ..." menu button on a phone. Nothing without the setting. Its own module, so the entry holds only the context.
 */
import { useContext } from 'react';
import { useLayoutMode } from '@/ui/hooks';
import { StructuresContext } from './context';
import { StructuresControl, StructuresMenu } from './control';

export function StructuresChoice() {
  const structures = useContext(StructuresContext);
  const layout = useLayoutMode();
  if (structures === null) return null;
  return layout === 'phone' ? <StructuresMenu structures={structures} /> : <StructuresControl structures={structures} />;
}
