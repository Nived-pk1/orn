/**
 * The conditions of a stage or a condition variant, entered through the editor's fields (step 6.9, Part 2): measures (a value, a range or a
 * word), choices, anhydrous, the lists, the qualifiers and the free text. `who` is how the labels speak of the row ("stage 1", "variant 2").
 * A variant shows only the fields it overrides, so its fields are added first through "Add a field to override".
 */
import type { Locator } from '@playwright/test';
import { asBag, chooseText, spaced } from './author-helpers';

const MEASURES = { temperature: 'Temperature', pressure: 'Pressure', time: 'Time' } as const;
const CHOICES = { medium: 'Medium', light: 'Light', atmosphere: 'Atmosphere' } as const;
const LISTS = { solventCharacter: 'Solvent character', activation: 'Activation' } as const;

/** The titles of the fields a variant can override, in the words of its "Add a field to override" select. */
const OVERRIDE_TITLES: Readonly<Record<string, RegExp>> = {
  temperature: /^Temperature$/i,
  pressure: /^Pressure$/i,
  time: /^Time$/i,
  medium: /^Medium$/i,
  light: /^Light$/i,
  atmosphere: /^Atmosphere$/i,
  anhydrous: /^Anhydrous$/i,
  solventCharacter: /^Solvent character$/i,
  activation: /^Activation$/i,
  other: /^Other qualifiers?$/i,
  text: /^Free text/i,
};

/** The parameter fields of `params` that hold something, in the order the editor draws them. */
export function usedFields(params: Record<string, unknown>): string[] {
  return Object.keys(OVERRIDE_TITLES).filter((field) => {
    const value = params[field];
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '';
  });
}

async function setMeasure(scope: Locator, who: string, field: keyof typeof MEASURES, measure: Record<string, unknown>): Promise<void> {
  const title = MEASURES[field];
  const label = (what: string): string => `${title} ${what} of ${who}`;
  await scope.getByLabel(label('kind'), { exact: true }).selectOption(String(measure['kind']));
  if (measure['kind'] === 'value') await scope.getByLabel(label('value'), { exact: true }).fill(String(measure['value']));
  if (measure['kind'] === 'range') {
    await scope.getByLabel(label('minimum'), { exact: true }).fill(String(measure['min']));
    await scope.getByLabel(label('maximum'), { exact: true }).fill(String(measure['max']));
  }
  if (measure['kind'] !== 'qualitative') await scope.getByLabel(label('unit'), { exact: true }).selectOption(String(measure['unit']));
  else await scope.getByLabel(label('word'), { exact: true }).selectOption(String(measure['value']));
}

/** Enters every field of `params` (the demo's stage or variant parameters) into the row `who`. */
export async function setParameters(scope: Locator, who: string, params: Record<string, unknown>, override = false): Promise<void> {
  for (const field of usedFields(params)) {
    if (override) {
      const adder = scope.getByLabel(new RegExp(`^Add a field to override`)).last();
      const offered = await adder.locator('option').allTextContents();
      if (!offered.some((text) => (OVERRIDE_TITLES[field] as RegExp).test(text))) {
        console.log(`NOT OFFERED ${who}: the field "${field}" cannot be added to a variant (offered: ${offered.join(', ')})`);
        continue;
      }
      await chooseText(adder, OVERRIDE_TITLES[field] as RegExp);
    }
    const value = params[field];
    if (field in MEASURES) await setMeasure(scope, who, field as keyof typeof MEASURES, asBag(value));
    else if (field in CHOICES) await scope.getByLabel(`${CHOICES[field as keyof typeof CHOICES]} of ${who}`, { exact: true }).selectOption(String(value));
    else if (field === 'anhydrous') await scope.getByLabel(`Anhydrous of ${who}`, { exact: true }).selectOption(value === true ? 'yes' : 'no');
    else if (field in LISTS) {
      for (const word of value as string[]) await scope.getByRole('checkbox', { name: `${LISTS[field as keyof typeof LISTS]}: ${spaced(word)} (${who})`, exact: true }).check();
    } else if (field === 'other') {
      const group = scope.getByRole('group', { name: `Other qualifiers of ${who}`, exact: true });
      for (const [at, text] of (value as string[]).entries()) {
        await group.getByRole('button', { name: /^Add qualifier/i }).click();
        await group.getByLabel(`Qualifier ${at + 1}`, { exact: true }).fill(text);
      }
    } else if (field === 'text') await scope.getByLabel(`Free text of ${who}`, { exact: true }).fill(String(value));
  }
}
