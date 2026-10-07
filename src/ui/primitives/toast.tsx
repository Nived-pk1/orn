/**
 * Toasts (step 5.2): short results of an action ("Imported 120 records"). The region is ONE polite live region that is mounted
 * before any toast exists, so a screen reader announces each addition (UI_ARCHITECTURE §11). Our own component: no library, nothing
 * that injects styles (CSP, E3). At most `MAX_TOASTS` show at once; a newer toast pushes the oldest out (a toast is a
 * convenience, anything that must not be missed is also a banner or a status). A toast stays until dismissed unless `autoDismissMs`
 * is given. Timers are `setTimeout` in an effect, cleared on dismissal and on unmount.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Banner, type NoticeKind } from './banner';
import { Button } from './button';
import styles from './toast.module.css';

export const MAX_TOASTS = 5;

export interface ToastInput {
  readonly kind?: NoticeKind;
  readonly text: string;
  readonly autoDismissMs?: number;
}

export interface Toasts {
  /** Shows a toast; answers its id. */
  push(toast: ToastInput): number;
  dismiss(id: number): void;
}

interface Item extends ToastInput {
  readonly id: number;
}

const ToastContext = createContext<Toasts | null>(null);

export function useToasts(): Toasts {
  const value = useContext(ToastContext);
  if (value === null) throw new Error('useToasts was called outside a ToastProvider');
  return value;
}

function AutoDismiss(props: { readonly ms: number; readonly onDone: () => void }) {
  const done = useRef(props.onDone);
  done.current = props.onDone;
  useEffect(() => {
    const timer = setTimeout(() => done.current(), props.ms);
    return () => clearTimeout(timer);
  }, [props.ms]);
  return null;
}

export function ToastProvider(props: { readonly children: ReactNode }) {
  const [items, setItems] = useState<readonly Item[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const push = useCallback((toast: ToastInput): number => {
    const id = next.current;
    next.current += 1;
    setItems((current) => [...current, { ...toast, id }].slice(-MAX_TOASTS));
    return id;
  }, []);
  const api = useMemo<Toasts>(() => ({ push, dismiss }), [push, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div className={styles.region} role="status" aria-live="polite" aria-relevant="additions text" aria-label="Notifications">
        {items.map((item) => (
          <div key={item.id} className={styles.toast}>
            <Banner kind={item.kind ?? 'info'} actions={<Button variant="quiet" onClick={() => dismiss(item.id)}>Dismiss</Button>}>
              {item.text}
            </Banner>
            {item.autoDismissMs === undefined ? null : <AutoDismiss ms={item.autoDismissMs} onDone={() => dismiss(item.id)} />}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
