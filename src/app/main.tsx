// z.config({ jitless: true }) comes FIRST (a side-effect module): the page policy has no 'unsafe-eval', so zod must interpret.
import '@/workers/zod-jitless';
import '@/ui/design';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import demoUrl from '../../data/seed/demo.orn.json?url';
import { App } from './App';
import { createBrowserEnv } from './env';
import { installLifecycle } from './lifecycle';
import { createAppServices } from './services';
import { createInspectorStore, createNavigatorUi, createPanelsStore, NAVIGATOR_UI_KEY } from '@/ui/state';
import { createTextMeasurer } from './text-measurer';
import type { DemoLoad } from './window/context';
import { createInspectorPorts } from './window/inspector-port';
import { createNavigatorPorts } from './window/navigator-port';
import { createPanelsPort, createUiEntryPort } from './window/panels-port';

/** The bundled demo file, served from this origin (the import pipeline reads it like any file the user picks). */
async function loadDemo(): Promise<DemoLoad> {
  try {
    const response = await fetch(demoUrl);
    if (!response.ok) return { ok: false, message: `the server answered ${response.status}` };
    return { ok: true, blob: await response.blob(), fileName: 'demo.orn.json' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function start(): Promise<void> {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element #root is missing from index.html');
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
  const navigator = createNavigatorPorts(services, measurer, env.timers, navigatorUi);
  const inspector = createInspectorPorts(services, navigator, createInspectorStore(), panels);
  installLifecycle(services, window);
  // A move made less than the debounce ago is written when the page goes away (best effort; the write is asynchronous).
  window.addEventListener('pagehide', () => void navigatorUi.flush());
  createRoot(rootElement).render(
    <StrictMode>
      <App value={{ services, panels, navigator, inspector, loadDemo, reload: () => window.location.reload() }} />
    </StrictMode>,
  );
}

void start();
