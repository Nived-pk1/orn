/**
 * Toasts (step 5.2): short results of an action ("Imported 120 records"). The region is ONE polite live region that is mounted
 * before any toast exists, so a screen reader announces each addition (UI_ARCHITECTURE §11). Our own component: no library, nothing
 * that injects styles (CSP, E3). At most `MAX_TOASTS` show at once; a newer toast pushes the oldest out (a toast is a
 * convenience, anything that must not be missed is also a banner or a status). A toast stays until dismissed unless `autoDismissMs`
 * is given. Timers are `setTimeout` in an effect, cleared on dismissal and on unmount.
 * Phone (ADR-039, `folded`): nothing floats over the page. The toasts are counted and listed by whoever calls `useToastView` and renders
 * `ToastItems` (the phone's folded notices line); a visually hidden live region, mounted from the start, still announces each addition.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Banner, type NoticeKind } from './banner';
import { Button } from './button';
import styles from './toast.module.css';
import hidden from './visually-hidden.module.css';

export const MAX_TOASTS = 5;

export interface ToastInput {
  readonly kind?: NoticeKind;
  readonly text: string;
  readonly autoDismissMs?: number;
  /** One action of the toast (step 5.9a: "Undo import"); choosing it also dismisses the toast. */
  readonly action?: { readonly label: string; readonly onAction: () => void };
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

/** What a place that shows the toasts itself (the phone's notices line) reads. */
export interface ToastView {
  readonly items: readonly (ToastInput & { readonly id: number })[];
  readonly dismiss: (id: number) => void;
}
const ViewContext = createContext<ToastView | null>(null);

/** The toasts shown now, or null outside a provider. */
export function useToastView(): ToastView | null {
  return useContext(ViewContext);
}

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

/** The toasts as banners (the floating region's content, or the phone's notices line when the provider is `folded`). */
export function ToastItems() {
  const view = useContext(ViewContext);
  if (view === null) return null;
  const { items, dismiss } = view;
  return (
    <>
      {items.map((item) => (
        <div key={item.id} className={styles.toast}>
          <Banner
            kind={item.kind ?? 'info'}
            actions={
              <>
                {item.action === undefined ? null : (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      dismiss(item.id);
                      item.action?.onAction();
                    }}
                  >
                    {item.action.label}
                  </Button>
                )}
                <Button variant="quiet" onClick={() => dismiss(item.id)}>Dismiss</Button>
              </>
            }
          >
            {item.text}
          </Banner>
          {item.autoDismissMs === undefined ? null : <AutoDismiss ms={item.autoDismissMs} onDone={() => dismiss(item.id)} />}
        </div>
      ))}
    </>
  );
}

export function ToastProvider(props: { readonly children: ReactNode; readonly folded?: boolean }) {
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
  const view = useMemo(() => ({ items, dismiss }), [items, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      <ViewContext.Provider value={view}>
        {props.children}
        {props.folded === true ? (
          <div className={hidden.hidden} role="status" aria-live="polite" aria-relevant="additions text" aria-label="Notifications">
            {items.map((item) => (
              <p key={item.id}>{item.text}</p>
            ))}
          </div>
        ) : (
          <div className={styles.region} role="status" aria-live="polite" aria-relevant="additions text" aria-label="Notifications">
            <ToastItems />
          </div>
        )}
      </ViewContext.Provider>
    </ToastContext.Provider>
  );
}
