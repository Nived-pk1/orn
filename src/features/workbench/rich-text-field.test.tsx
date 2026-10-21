// @vitest-environment jsdom
/** The rich-text field (step 6.5a, D1): a plain textarea whose text is stored exactly as typed, a live preview through the core parser, a help line. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RICH_TEXT_HELP, RichTextField, type RichTextFieldProps } from './rich-text-field';

afterEach(cleanup);

function Host(props: { readonly initial?: string; readonly onValue?: (value: string) => void } & Partial<RichTextFieldProps>) {
  const { initial, onValue, ...rest } = props;
  const [value, setValue] = useState(initial ?? '');
  return (
    <RichTextField
      id="summary"
      label="Summary"
      path="summary"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      {...rest}
    />
  );
}
const preview = () => screen.getByRole('region', { name: 'Preview of Summary' });

describe('RichTextField', () => {
  it('is a plain textarea with the field path, and hands back the text EXACTLY as typed (spaces, newlines, markup)', () => {
    const seen: string[] = [];
    render(<Host onValue={(v) => seen.push(v)} />);
    const box = screen.getByRole('textbox', { name: 'Summary' });
    expect(box.tagName).toBe('TEXTAREA');
    expect(box.getAttribute('data-field-path')).toBe('summary');
    const typed = '  *a*  \n\n- b \n_{ 2 }  ';
    fireEvent.change(box, { target: { value: typed } });
    expect(seen).toEqual([typed]);
    expect((box as HTMLTextAreaElement).value).toBe(typed);
  });

  it('shows the one-line help', () => {
    render(<Host />);
    expect(RICH_TEXT_HELP).toBe('*emphasis*, **strong**, H_{2}O, Br^{-}, - bullet, [[record link]]');
    expect(screen.getByText(RICH_TEXT_HELP)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Summary' }).getAttribute('aria-describedby')).toBeTruthy();
  });

  it('previews emphasis, strong, subscripts, superscripts and bullets as elements', () => {
    render(<Host initial={'An *emphasised* and **strong** word of H_{2}O and Br^{-}.\n\n- first\n- second'} />);
    const box = within(preview());
    expect(box.getByText('emphasised').tagName).toBe('EM');
    expect(box.getByText('strong').tagName).toBe('STRONG');
    expect(box.getByText('2').tagName).toBe('SUB');
    expect(box.getByText('-').tagName).toBe('SUP');
    expect(box.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['first', 'second']);
  });

  it('previews a [[link]] by its label; a record that is not there says so in words', () => {
    render(<Host initial={'See [[rxn_gone|the oxidation]] and [[rxn_here]].'} linkExists={(ref) => ref.id === 'rxn_here'} />);
    const box = within(preview());
    expect(box.getByText(/the oxidation, missing record rxn_gone/)).toBeTruthy();
    expect(box.getByText('rxn_here')).toBeTruthy();
    expect(box.queryByText(/missing record rxn_here/)).toBeNull();
  });

  it("a [[link]] with no label to an existing record shows the record's NAME (as the inspector does); a label wins; a missing record is unchanged", () => {
    render(<Host initial={'See [[rxn_here]], [[rxn_here|my words]] and [[rxn_gone]].'} linkExists={(ref) => ref.id === 'rxn_here'} linkName={(ref) => (ref.id === 'rxn_here' ? 'Ethanol to ethanal' : undefined)} />);
    const box = within(preview());
    expect(box.getByText('Ethanol to ethanal')).toBeTruthy();
    expect(box.queryByText('rxn_here')).toBeNull();
    expect(box.getByText('my words')).toBeTruthy();
    expect(box.getByText(/missing record rxn_gone/)).toBeTruthy();
  });

  it('malformed markup is shown literally and does not throw', () => {
    render(<Host initial={'*never closed and **half and _{open and [[rxn_'} />);
    expect(preview().textContent).toContain('*never closed and **half and _{open and [[rxn_');
  });

  it('typed HTML is text, never markup', () => {
    const { container } = render(<Host initial={'<script>alert(1)</script><img src=x onerror=alert(2)>'} />);
    expect(preview().textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(preview().querySelector('*:not(p)')).toBeNull();
  });

  it('an empty value has NO preview region (K2); the help line stays; the region appears with text', () => {
    render(<Host />);
    expect(screen.queryByRole('region', { name: /^Preview of/ })).toBeNull();
    expect(screen.getByText(/\*emphasis\*/)).toBeTruthy();
    cleanup();
    render(<Host initial="some text" />);
    expect(preview().textContent).toBe('some text');
  });

  it('is read-only with a reason, and marks an invalid field', () => {
    const onChange = vi.fn();
    render(<RichTextField id="n" label="Notes" path="notes" value="x" onChange={onChange} unavailable="This tab is read-only" invalid />);
    const box = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.getAttribute('aria-invalid')).toBe('true');
  });

  it('on a phone the field says so for the stacked layout', () => {
    render(<Host phone />);
    expect(screen.getByRole('textbox', { name: 'Summary' }).closest('[data-rich-field]')?.getAttribute('data-phone')).toBe('true');
  });
});
