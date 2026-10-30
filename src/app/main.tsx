// z.config({ jitless: true }) comes FIRST (a side-effect module): the page policy has no 'unsafe-eval', so zod must interpret.
import '@/workers/zod-jitless';
import '@/ui/design';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { dataset } from 'virtual:orn-dataset';
import { App } from './App';
import { pageTitleOf } from './edition';
import { createDatasetInfo } from './window/dataset-info';
import { createBrowserEnv } from './env';
import { installLifecycle } from './lifecycle';
import { createAppServices } from './services';
import { createInspectorStore, createNavigatorUi, createPanelsStore, NAVIGATOR_UI_KEY } from '@/ui/state';
import { createTextMeasurer } from './text-measurer';
import type { DemoLoad } from './window/context';
import { createInspectorPorts } from './window/inspector-port';
import { createFactsPort } from './window/facts-port';
import { createLocalTimeFormatter } from './window/local-time';
import { createNavigatorPorts } from './window/navigator-port';
import { createPanelsPort, createUiEntryPort } from './window/panels-port';
import { createReviewUiPort } from './window/review-ui';

/** The dataset this build ships, served from this origin: the published study dataset or the bundled demo (the import pipeline reads it like any file the user picks). */
async function loadDemo(): Promise<DemoLoad> {
  try {
    const response = await fetch(dataset.url);
    if (!response.ok) return { ok: false, message: `the server answered ${response.status}` };
    return { ok: true, blob: await response.blob(), fileName: dataset.fileName };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function start(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element #root is missing from index.html');
  document.title = pageTitleOf();
  const env = createBrowserEnv();
  const services = await createAppServices(env);
  const panels = createPanelsStore(createPanelsPort(services), env.timers);
  const measurer = createTextMeasurer({
    fonts: document.fonts,
    context: () => document.createElement('canvas').getContext('2d') ?? undefined,
    timers: env.timers,
    log: (type, message) => services.logApp(type, message),
  });
  const navigatorUi = createNavigatorUi(createUiEntryPort(services, NAVIGATOR_UI_KEY), env.timers, (type, message) => services.logApp(type, message));
  const navigator = createNavigatorPorts(services, measurer, env.timers, navigatorUi, {
    mode: () => panels.getState().structureMode,
    setMode: (mode) => panels.getState().setStructureMode(mode),
    equationNames: () => panels.getState().equationNames,
    setEquationNames: (names) => panels.getState().setEquationNames(names),
    subscribe: (listener) => panels.subscribe(listener),
  }, createFactsPort(services.chem));
  const inspector = createInspectorPorts(services, navigator, createInspectorStore(), panels);
  installLifecycle(services, window, document);
  // A move made less than the debounce ago is written when the page goes away (best effort; the write is asynchronous).
  window.addEventListener('pagehide', () => void navigatorUi.flush());
  createRoot(rootElement).render(
    <StrictMode>
      <App value={{ services, panels, navigator, inspector, loadDemo, dataset: createDatasetInfo(services, dataset.kind === 'published' ? dataset : null), nowMs: () => env.clock.nowMs(), formatTime: createLocalTimeFormatter(), reviewUi: createReviewUiPort(services), reload: () => window.location.reload() }} />
    </StrictMode>,
  );
}

void start();
