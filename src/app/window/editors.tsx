/**
 * The editors' entry shell (ADR-040; entry room, step 6.9 Z3). `EditorsProvider` is all of the editors that is in Studio's entry chunk: it
 * provides the context the top bar, the inspector and the palette read (`null` until the controller has loaded, which is what Study's
 * inert stand-in answers, so those controls simply appear a moment after the first paint) and loads the controller (`editors-controller.tsx`:
 * the drafts list, the editor, quick entry, delete, templates) with the injected scheduler after the first paint. The children keep their
 * place in the tree, so nothing remounts when the controller arrives. No chemistry.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useApp } from './context';
import { EditorsContext, type EditorsApi, type EditorsControllerType } from './drafts-ui';

export function EditorsProvider(props: { readonly children: ReactNode }) {
  const { inspector, editorsController } = useApp();
  const [api, setApi] = useState<EditorsApi | null>(null);
  const [Controller, setController] = useState<EditorsControllerType | null>(() => editorsController ?? null);
  useEffect(() => {
    if (Controller !== null) return undefined;
    let live = true;
    const cancel = inspector.timers.after(0, () => void import('./editors-controller').then((m) => live && setController(() => m.EditorsController)));
    return () => {
      live = false;
      cancel();
    };
  }, [Controller, inspector.timers]);
  return (
    <EditorsContext.Provider value={api}>
      {props.children}
      {Controller === null ? null : <Controller onApi={setApi} />}
    </EditorsContext.Provider>
  );
}
