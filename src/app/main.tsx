// z.config({ jitless: true }) comes FIRST (a side-effect module): the page policy has no 'unsafe-eval', so zod must interpret.
import '@/workers/zod-jitless';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import demoUrl from '../../data/seed/demo.orn.json?url';
import { App } from './App';
import { createBrowserEnv } from './env';
import { installLifecycle } from './lifecycle';
import { createAppServices } from './services';
import type { DemoLoad } from './window/context';

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
  const services = await createAppServices(createBrowserEnv());
  installLifecycle(services, window);
  createRoot(rootElement).render(
    <StrictMode>
      <App value={{ services, loadDemo, reload: () => window.location.reload() }} />
    </StrictMode>,
  );
}

void start();
