/**
 * Legacy v6 condition handling: `CONDFLAG_RE` + `autofillConditionFlags` (structured flags inferred from free text, once, only
 * where a flag is still empty) and `COND_RE` + `splitLegacyReagent` (v4 reagent strings such as "NH2NH2, KOH, high temperature",
 * "O2, then H3O+" or "(i) O3 (ii) Zn/H2O"). The regexes are ported literally, quirks included (v4 temperatures such as "443 K"
 * end up as reagents; `\b` around `Δ` never matches next to a space). Conditions parsed here are inferences, not facts:
 * MIGRATION.md §4.5 turns every one of them into a review item later.
 */
import { assignOwn, or, type LegacyObject } from './text';

const CONDFLAG_RE = {
  heat: /\b(heat(ed)?|hot|reflux|warm(ed)?|Δ|high temperature)\b/i,
  light: /\b(light|hv|hν|uv|photo|photolysis)\b/i,
  anhydrous: /\b(anhydrous|dry)\b/i,
  dilute: /\b(dilute|dil\.?)\b/i,
  concentrated: /\bconc(entrated)?\.?\b/i,
  acidic: /\b(acidic|acid)\b/i,
  basic: /\b(basic|alkaline|base)\b/i,
  neutral: /\bneutral\b/i,
  aqueous: /\b(aqueous|aq\.?)\b/i,
  alcoholic: /\b(alcoholic|alc\.?)\b/i,
  temperature: /(-?\d+\s?°\s?[CFK]|\broom temperature\b|\brt\b)/i,
} as const;

/** Legacy `autofillConditionFlags`: a copy of `cond` whose still-empty flags are filled from `cond.text`. */
export function autofillConditionFlags(cond: LegacyObject): LegacyObject {
  const text = String(or(cond.text, ''));
  const out = assignOwn<LegacyObject>({}, cond);
  if (!out.heat && CONDFLAG_RE.heat.test(text)) out.heat = true;
  if (!out.light && CONDFLAG_RE.light.test(text)) out.light = true;
  if (!out.anhydrous && CONDFLAG_RE.anhydrous.test(text)) out.anhydrous = true;
  if (!out.strength) {
    if (CONDFLAG_RE.dilute.test(text)) out.strength = 'dilute';
    else if (CONDFLAG_RE.concentrated.test(text)) out.strength = 'concentrated';
  }
  if (!out.medium) {
    if (CONDFLAG_RE.acidic.test(text)) out.medium = 'acidic';
    else if (CONDFLAG_RE.basic.test(text)) out.medium = 'basic';
    else if (CONDFLAG_RE.neutral.test(text)) out.medium = 'neutral';
  }
  if (!out.phase) {
    if (CONDFLAG_RE.aqueous.test(text)) out.phase = 'aqueous';
    else if (CONDFLAG_RE.alcoholic.test(text)) out.phase = 'alcoholic';
  }
  if (!out.temperature) {
    const match = CONDFLAG_RE.temperature.exec(text);
    if (match) out.temperature = match[0];
  }
  return out;
}

const COND_RE = /(temp|heat|warm|hot|cold|dilute|dil\.|conc|reflux|pressure|atm|\bhv\b|hν|light|\buv\b|room|\brt\b|°|Δ|anhydrous|dry\b|alcoholic|aqueous)/i;

export interface SplitReagent {
  readonly reagents: string[];
  readonly workup: string[];
  readonly conditions: string[];
}

/**
 * Legacy `splitLegacyReagent`. A string with "(ii)" is cut at the numbered stages, otherwise at "then"; each stage is split
 * on `,` and `;`. A token that reads as a condition (and has no element-plus-digit shape such as "H2") is a condition; the rest
 * are reagents (first stage) or workup (later stages).
 */
export function splitLegacyReagent(value: unknown): SplitReagent {
  const result: SplitReagent = { reagents: [], workup: [], conditions: [] };
  const text = String(or(value, '')).trim();
  if (!text) return result;
  const stages = /\(ii\)/i.test(text)
    ? text
        .split(/\(i+v?\)/i)
        .map((stage) => stage.trim())
        .filter(Boolean)
    : text.split(/[,;]?\s*\bthen\b\s*/i);
  stages.forEach((stage, stageIndex) => {
    for (const token of stage
      .split(/\s*[,;]\s*/)
      .map((part) => part.trim())
      .filter(Boolean)) {
      if (COND_RE.test(token) && !/[A-Z][a-z]?\d/.test(token)) result.conditions.push(token);
      else (stageIndex === 0 ? result.reagents : result.workup).push(token);
    }
  });
  return result;
}
