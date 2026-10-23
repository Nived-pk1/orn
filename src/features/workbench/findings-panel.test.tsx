// @vitest-environment jsdom
/** The findings panel puts the schema library's phrases in words (step 6.8 follow-up U6). */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Finding } from '@/core/validation';
import { FindingsPanel } from './findings-panel';

afterEach(cleanup);

const finding = (message: string, path: string): Finding =>
  ({ id: `fnd_${path}`, ruleId: 'SCHEMA', level: 1, severity: 'error', subject: { kind: 'reaction', id: 'rxn_x' }, path, message, related: [] }) as Finding;

describe('FindingsPanel wording', () => {
  it('a choice not made and another schema phrase never show the library text', () => {
    render(
      <FindingsPanel
        heading="Findings"
        emptyText="none"
        inForm={() => false}
        onFocusField={vi.fn()}
        findings={[finding('Invalid option: expected one of "main"|"coproduct"', 'outcomes[0].products[0].role'), finding('Invalid input: expected number, received undefined', 'participants[0].coefficient'), finding('Must not be blank', 'name')]}
      />,
    );
    const text = screen.getByRole('region', { name: 'Findings' }).textContent ?? '';
    expect(text).toContain('Choose a role for product 1 of outcome 1');
    expect(text).toContain('Coefficient is not valid (participant 1)');
    expect(text).toContain('Must not be blank (name)');
    expect(text).not.toMatch(/Invalid|expected|received|undefined/);
  });
});
