// @vitest-environment jsdom
/**
 * The topic editor (step 6.6c part 2, M1): the schema's fields with no content default (the kind of topic and the order start empty),
 * a parent that cannot close a cycle, and the read-only "Mapped records" list with "Open in the inspector" and "Map a record to this topic".
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const open = (name: RegExp): void => {
  const toggle = screen.getAllByRole('button', { name })[0] as HTMLElement;
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};

describe('a new topic', () => {
  it('has no kind of topic and no order; the five kinds are in plain words; the parent starts as "None"; Save is refused until given', async () => {
    const { draft, rig } = showKnowledge('topic', { blank: true });
    expect(draft()).not.toHaveProperty('topicKind');
    expect(draft()).not.toHaveProperty('order');
    const kind = screen.getByLabelText('Kind of topic') as HTMLSelectElement;
    expect(kind.value).toBe('');
    expect(within(kind).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a kind', 'Subject', 'Chapter', 'Section', 'Topic', 'Subtopic']);
    expect((screen.getByLabelText('Order') as HTMLInputElement).value).toBe('');
    const parent = screen.getByLabelText('Parent topic') as HTMLSelectElement;
    expect(parent.value).toBe('');
    expect(within(parent).getAllByRole('option')[0]?.textContent).toBe('None (a top-level topic)');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    expect(Object.keys(rig.store.getState().records.topic)).toHaveLength(27);
  });
  it('stores the name, the kind and an order exactly as given; an empty order removes it; the parent is a topic of the tree', () => {
    const { draft } = showKnowledge('topic', { blank: true });
    set('Name (required)', 'Zz topic');
    set('Kind of topic', 'section');
    set('Order', '2.5');
    expect(draft()).toMatchObject({ name: 'Zz topic', topicKind: 'section', order: 2.5 });
    set('Order', '');
    expect(draft()).not.toHaveProperty('order');
    set('Parent topic', 'top_organic-chemistry');
    expect(draft().parentId).toBe('top_organic-chemistry');
    set('Parent topic', '');
    expect(draft()).not.toHaveProperty('parentId');
  });
  it('says which siblings come before and after the order given', () => {
    showKnowledge('topic', { blank: true });
    set('Parent topic', 'top_alcohols-phenols-ethers');
    set('Order', '8.5');
    expect(screen.getByText(/Before: .* \(order 8\)\. After: /)).toBeTruthy();
  });
});

describe('the parent', () => {
  it('cannot be the topic itself or one below it (a cycle), and the options say why', () => {
    const { draft } = showKnowledge('topic', { target: 'top_alcohols-phenols-ethers' });
    const parent = screen.getByLabelText('Parent topic') as HTMLSelectElement;
    const option = (id: string) => parent.querySelector(`option[value="${id}"]`) as HTMLOptionElement;
    expect(parent.value).toBe('top_organic-chemistry');
    expect(option('top_alcohols-phenols-ethers').disabled).toBe(true);
    expect(option('top_alcohol-oxidation-dehydration').disabled).toBe(true);
    expect(option('top_alcohol-oxidation-dehydration').textContent).toMatch(/already below/);
    expect(option('top_organic-chemistry').disabled).toBe(false);
    expect(draft().parentId).toBe('top_organic-chemistry');
  });
});

describe('the mapped records', () => {
  it('lists the records mapped to the topic with their role, each with a way to open it in the inspector', () => {
    const shown = showKnowledge('topic', { target: 'top_alcohol-oxidation-dehydration' });
    open(/Mapped records/);
    const list = screen.getByRole('list', { name: 'Mapped records' });
    expect(within(list).getByText(/1° alcohol → aldehyde \(PCC\) \(.*reaction\) · core/)).toBeTruthy();
    fireEvent.click(within(list).getAllByRole('button', { name: /Open .* in the inspector/ })[0] as HTMLElement);
    expect(shown.openRecord).toHaveBeenCalledWith(expect.objectContaining({ kind: 'reaction' }));
  });
  it('"Map a record to this topic" keeps the draft and asks for a NEW mapping with the topic filled in', () => {
    const shown = showKnowledge('topic', { target: 'top_alcohol-oxidation-dehydration' });
    open(/Mapped records/);
    fireEvent.click(screen.getByRole('button', { name: 'Map a record to this topic' }));
    expect(shown.start).toHaveBeenCalledWith('topic_mapping', { topicId: 'top_alcohol-oxidation-dehydration' });
  });
  it('on a topic not saved yet the button says to save it first', () => {
    showKnowledge('topic', { blank: true });
    open(/Mapped records/);
    const button = screen.getByRole('button', { name: 'Map a record to this topic' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Map a record to this topic', description: /save the topic first/i })).toBeTruthy();
  });
});
