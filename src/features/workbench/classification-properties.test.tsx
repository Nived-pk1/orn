// @vitest-environment jsdom
/** The classification section (decision C3) and the species properties section (decision C4, as decided in the Part 1 review). Each reports recipes; the harness applies them. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DraftRecipe } from '@/core/editing';
import { ClassificationSection } from './classification-section';
import { PropertiesSection } from './properties-section';
import type { RecordChoice, RecordPickerPort } from './record-picker-contracts';

afterEach(cleanup);

const SN2: RecordChoice = { kind: 'concept', id: 'cpt_sn2', name: 'SN2', kindWords: 'mechanism class', scope: '' };
const SOURCE: RecordChoice = { kind: 'reference', id: 'ref_a', name: 'Morrison and Boyd', kindWords: 'textbook, 2010', scope: '' };
const picker: RecordPickerPort = {
  describe: (kind, id) => [SN2, SOURCE].find((c) => c.kind === kind && c.id === id),
  search: async (kinds, text) => [SN2, SOURCE].filter((c) => kinds.includes(c.kind) && c.name.toLowerCase().includes(text.toLowerCase())),
  count: () => 1,
  sourceOf: (id) => (id === 'ref_a' ? { title: 'Morrison and Boyd', year: 2010 } : undefined),
};

interface Spy {
  draft?: unknown;
}
function Harness(props: { initial: Record<string, unknown>; spy: Spy; children: (p: { draft: unknown; onEdit: (r: DraftRecipe, path?: string) => void }) => ReactNode }) {
  const [draft, setDraft] = useState(props.initial);
  const onEdit = (recipe: DraftRecipe): void =>
    setDraft((d) => {
      const copy = structuredClone(d);
      recipe(copy);
      return copy;
    });
  props.spy.draft = draft;
  return <>{props.children({ draft, onEdit })}</>;
}

describe('the classification section', () => {
  const show = (initial: unknown[] = []): Spy => {
    const spy: Spy = {};
    render(
      <Harness initial={{ mechanismClasses: initial }} spy={spy}>
        {(p) => <ClassificationSection {...p} field="mechanismClasses" label="Mechanism classes" findLabel="Find a mechanism class by name" picker={picker} />}
      </Harness>,
    );
    return spy;
  };
  const list = (spy: Spy) => (spy.draft as { mechanismClasses: unknown[] }).mechanismClasses;
  it('adds a concept through the picker with NO certainty; the chip says the certainty is not chosen; the select starts at "Choose certainty"', async () => {
    const spy = show();
    fireEvent.change(screen.getByLabelText('Find a mechanism class by name'), { target: { value: 'sn' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add SN2' }));
    expect(list(spy)).toEqual([{ conceptId: 'cpt_sn2' }]);
    expect(screen.getAllByText('SN2')).toHaveLength(1);
    const select = screen.getByLabelText('Certainty of SN2') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose certainty', 'Definite', 'Probable', 'Possible']);
  });
  it('choosing the certainty shows the name ONCE, beside the choice (K3); Remove removes', () => {
    const spy = show([{ conceptId: 'cpt_sn2' }]);
    fireEvent.change(screen.getByLabelText('Certainty of SN2'), { target: { value: 'definite' } });
    expect(list(spy)).toEqual([{ conceptId: 'cpt_sn2', certainty: 'definite' }]);
    expect(screen.getAllByText('SN2')).toHaveLength(1);
    expect(screen.queryByText(/SN2 \(/)).toBeNull();
    expect((screen.getByLabelText('Certainty of SN2') as HTMLSelectElement).value).toBe('definite');
    fireEvent.click(screen.getByRole('button', { name: 'Remove SN2' }));
    expect(list(spy)).toEqual([]);
  });
});

describe('V4: concepts of the matching kind come first', () => {
  const RT: RecordChoice = { kind: 'concept', id: 'cpt_add', name: 'Nucleophilic addition', kindWords: 'reaction type', scope: '', conceptKind: 'reaction_type' };
  const MC: RecordChoice = { kind: 'concept', id: 'cpt_sn2b', name: 'Nucleophilic SN2', kindWords: 'mechanism class', scope: '', conceptKind: 'mechanism_class' };
  const both: RecordPickerPort = { ...picker, search: async (kinds, text) => [MC, RT].filter((c) => kinds.includes(c.kind) && c.name.toLowerCase().includes(text.toLowerCase())) };
  it('reaction types: reaction types first under "Concepts found", every other concept under "Other concepts" (still choosable)', async () => {
    const spy: Spy = {};
    render(
      <Harness initial={{ reactionTypes: [] }} spy={spy}>
        {(p) => <ClassificationSection {...p} field="reactionTypes" label="Reaction types" findLabel="Find a reaction type by name" picker={both} />}
      </Harness>,
    );
    fireEvent.change(screen.getByLabelText('Find a reaction type by name'), { target: { value: 'nucleophilic' } });
    const first = await screen.findByRole('list', { name: 'Concepts found' });
    expect(within(first).getByText(/Nucleophilic addition/)).toBeTruthy();
    expect(within(first).queryByText(/SN2/)).toBeNull();
    const other = screen.getByRole('list', { name: 'Other concepts' });
    expect(within(other).getByText(/Nucleophilic SN2/)).toBeTruthy();
    fireEvent.click(within(other).getByRole('button', { name: 'Add Nucleophilic SN2' }));
    expect((spy.draft as { reactionTypes: unknown[] }).reactionTypes).toEqual([{ conceptId: 'cpt_sn2b' }]);
  });
  it('mechanism classes: mechanism classes come first', async () => {
    const spy: Spy = {};
    render(
      <Harness initial={{ mechanismClasses: [] }} spy={spy}>
        {(p) => <ClassificationSection {...p} field="mechanismClasses" label="Mechanism classes" findLabel="Find a mechanism class by name" picker={both} />}
      </Harness>,
    );
    fireEvent.change(screen.getByLabelText('Find a mechanism class by name'), { target: { value: 'nucleophilic' } });
    const first = await screen.findByRole('list', { name: 'Concepts found' });
    expect(within(first).getByText(/Nucleophilic SN2/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Other concepts' })).getByText(/Nucleophilic addition/)).toBeTruthy();
  });
});

describe('the properties section', () => {
  const show = (properties: unknown[] = [], phone = false): Spy => {
    const spy: Spy = {};
    render(
      <Harness initial={{ properties }} spy={spy}>
        {(p) => <PropertiesSection {...p} picker={picker} phone={phone} />}
      </Harness>,
    );
    return spy;
  };
  const props = (spy: Spy) => (spy.draft as { properties: Record<string, unknown>[] }).properties;
  it('Add a property opens it with "Choose a property" (no default) and an empty value', () => {
    const spy = show();
    fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
    expect(props(spy)).toEqual([{ value: '', citations: [] }]);
    const select = screen.getByLabelText('Property') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getAllByRole('option')[0]?.textContent).toBe('Choose a property');
  });
  it('the value is free text with the unit written in it; a hint under it per key; the hint never changes the value', () => {
    const spy = show([{ key: 'boiling_point', value: '', citations: [] }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit property boiling point' }));
    expect(screen.getByText('e.g. 78 °C (at 1 atm)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '78.4 °C (at 1 atm)' } });
    expect(props(spy)[0]?.value).toBe('78.4 °C (at 1 atm)');
    fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'density' } });
    expect(screen.getByText('e.g. 0.789 g/cm³ (at 20 °C)')).toBeTruthy();
    expect(props(spy)[0]?.value).toBe('78.4 °C (at 1 atm)');
  });
  it('the name field shows for "other" only', () => {
    show([{ key: 'colour', value: 'red', citations: [] }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit property colour' }));
    expect(screen.queryByLabelText('Name of the property (required)')).toBeNull();
    fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'other' } });
    expect(screen.getByLabelText('Name of the property (required)')).toBeTruthy();
  });
  it('summary lines "<property> · <value>", one open at a time, Up, Down and Remove', () => {
    const spy = show([{ key: 'colour', value: 'red', citations: [] }, { key: 'odour', value: 'sweet', citations: [] }]);
    expect(screen.getByText('Colour · red')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit property colour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit property odour' }));
    expect(screen.getAllByLabelText('Value')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Move property odour up' }));
    expect(props(spy).map((p) => p.key)).toEqual(['odour', 'colour']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove property odour' }));
    expect(props(spy).map((p) => p.key)).toEqual(['colour']);
  });
  it('a property may cite a source (the shared citations component)', async () => {
    const spy = show([{ key: 'colour', value: 'red', citations: [] }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit property colour' }));
    fireEvent.change(screen.getByLabelText('Find a source by title'), { target: { value: 'morrison' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Add Morrison and Boyd' }));
    expect(props(spy)[0]?.citations).toEqual([{ referenceId: 'ref_a' }]);
  });
});
