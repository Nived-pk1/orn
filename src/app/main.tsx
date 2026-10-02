import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Nothing creates the workers until Phase 5 (D7); this import makes the build bundle the four worker entries (step 4.6, `npm run build:smoke`).
import './worker-factories';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root is missing from index.html');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
