/**
 * The appearance values (step 8.4f, D1/D2): Theme (System, Light, Dark) and Reduce motion. Persisted in its own `uiState` entry
 * ("appearance") through the same port shape as the panels store; read tolerantly (a bad field resets and is reported, unknown fields
 * are kept and written back); a tab that cannot write keeps the choice for the session. Pure of the DOM: `appearanceAttributes` says
 * what the root element carries, and `src/app` writes it before the first render.
 */
import type { StoreApi } from 'zustand/vanilla';
import type { PanelPersistence } from './panels';

export const APPEARANCE_KEY = 'appearance';
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export interface AppearanceValues {
  readonly theme: Theme;
  /** Turned on here: motion is off. Off: the device's setting decides (CSS media query). */
  readonly reduceMotion: boolean;
}
export const APPEARANCE_DEFAULTS: AppearanceValues = Object.freeze({ theme: 'system', reduceMotion: false });

export interface AppearanceState extends AppearanceValues {
  readonly persistence: PanelPersistence;
  readonly resetFields: readonly string[];
  setTheme(theme: Theme): void;
  setReduceMotion(on: boolean): void;
}
export type AppearanceStore = StoreApi<AppearanceState>;

export interface ParsedAppearance {
  readonly values: AppearanceValues;
  readonly damaged: readonly string[];
  readonly extra: Readonly<Record<string, unknown>>;
}

const KNOWN = new Set(['theme', 'reduceMotion']);

export function parseAppearance(raw: unknown): ParsedAppearance {
  if (raw === undefined) return { values: APPEARANCE_DEFAULTS, damaged: [], extra: {} };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { values: APPEARANCE_DEFAULTS, damaged: ['appearance'], extra: {} };
  const record = raw as Record<string, unknown>;
  const damaged: string[] = [];
  let theme: Theme = APPEARANCE_DEFAULTS.theme;
  if (record.theme !== undefined) {
    if ((THEMES as readonly unknown[]).includes(record.theme)) theme = record.theme as Theme;
    else damaged.push('theme');
  }
  let reduceMotion = APPEARANCE_DEFAULTS.reduceMotion;
  if (record.reduceMotion !== undefined) {
    if (typeof record.reduceMotion === 'boolean') reduceMotion = record.reduceMotion;
    else damaged.push('reduceMotion');
  }
  return { values: { theme, reduceMotion }, damaged, extra: Object.fromEntries(Object.entries(record).filter(([key]) => !KNOWN.has(key))) };
}

/** The attributes of the root element; `null` removes one. System writes no theme: the device decides, by CSS alone. */
export function appearanceAttributes(values: AppearanceValues): { readonly 'data-theme': string | null; readonly 'data-reduce-motion': string | null } {
  return { 'data-theme': values.theme === 'system' ? null : values.theme, 'data-reduce-motion': values.reduceMotion ? 'on' : null };
}
