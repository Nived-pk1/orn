/**
 * Starts the map canvas chunk early (step 8.4s, L1) where the map is the first screen: Studio, and a phone whose saved tab is the map.
 * The same `import()` the map's own lazy load makes, so the chunk downloads while the window is still booting (no modulepreload).
 */
import { useEffect } from 'react';
import { warmNavigatorCanvas } from '@/features/navigator';
import { EDITING } from '@/app/edition';

export function useWarmCanvas(phone: boolean, phoneTab: string): void {
  const wanted = EDITING || (phone && phoneTab === 'map');
  useEffect(() => {
    if (wanted) warmNavigatorCanvas();
  }, [wanted]);
}
