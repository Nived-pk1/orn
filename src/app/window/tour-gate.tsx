/** The first-run tour's gate (step 8.4g Part B, G4), a lazy chunk with the flag: shows the tour until it is finished or skipped, and writes the mark once. */
import { useState, useSyncExternalStore } from 'react';
import { createTourFlag, type TourServices } from './tour-flag';
import { Tour } from './tour';

export default function TourGate(props: { readonly services: TourServices }) {
  const [flag] = useState(() => createTourFlag(props.services));
  const done = useSyncExternalStore(flag.subscribe, flag.done);
  return done ? null : <Tour onFinish={flag.finish} />;
}
