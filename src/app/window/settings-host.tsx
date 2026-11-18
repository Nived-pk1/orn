/** The Settings page on the canvas (step 8.4f, D1): the app composes the settings feature with the exam menu and the backup action; its own lazy chunk in BOTH editions. The appearance store is made here, once per storage port (the page boot only applies the stored values), and it writes later changes to the root element. */
import { useMemo } from 'react';
import { SettingsPage } from '@/features/settings';
import { useNavigator } from '@/features/navigator';
import { createAppearanceStore, type AppearanceStore, type PanelsPort, type PanelsTimers } from '@/ui/state';
import { watchAppearance } from '@/app/appearance-watch';
import { useApp } from './context';
import { ExamScopeSelector, type ExamScopeBinding } from './exam-scope-selector';
import { useExportOpen } from './export-context';
import { useFace } from './my-records-face';
import { openShortcuts } from './shortcuts-state';
import { useSyncExternalStore } from 'react';

const SESSION_ONLY: PanelsPort = { stored: undefined, mode: () => 'session_only', save: () => Promise.resolve() };
const stores = new WeakMap<PanelsPort, AppearanceStore>();

function storeOf(port: PanelsPort, timers: PanelsTimers): AppearanceStore {
  const known = stores.get(port);
  if (known !== undefined) return known;
  const made = createAppearanceStore(port, timers);
  watchAppearance(document.documentElement, made);
  stores.set(port, made);
  return made;
}

export function SettingsHost(props: { readonly exam: ExamScopeBinding }) {
  const { appearancePort, mine } = useApp();
  const face = useFace(mine);
  const recent = useSyncExternalStore(face.subscribe, () => face.recent().length);
  const { ports } = useNavigator();
  const appearance = useMemo(() => storeOf(appearancePort ?? SESSION_ONLY, ports.timers), [appearancePort, ports.timers]);
  const openExport = useExportOpen();
  return <SettingsPage appearance={appearance} exam={<ExamScopeSelector binding={props.exam} part="chip" />} onShortcuts={openShortcuts} {...(mine === undefined ? {} : { recent: { count: recent, onClear: face.clearRecent } })} {...(openExport === undefined ? {} : { onBackUp: openExport })} />;
}
