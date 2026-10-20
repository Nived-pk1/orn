/**
 * Studio follow-up G3: the reaction editor's preview for Ethanol + conc. H2SO4. Nothing is clipped by the preview's width (no horizontal
 * overflow in the panel) and no "+" stands with nothing after it: every "+" is in the same unbreakable unit as the term it introduces.
 */
import { expect, test } from './fixtures';
import { editorDialog, openDemo, openNamesEditor, showRecord } from './editor-kit';

const ETHANOL = 'rxn_ethanol-conc-h2so4';
const NAME = 'Ethanol + conc. H₂SO₄';

test('the preview of Ethanol + conc. H2SO4: nothing clipped sideways, no "+" without its term', async ({ page }) => {
  test.setTimeout(300_000);
  await openDemo(page);
  await showRecord(page, 'r', NAME, ETHANOL);
  await openNamesEditor(page, NAME);
  const dialog = editorDialog(page, NAME);
  const panel = dialog.getByRole('region', { name: 'Preview' });
  await expect(panel.getByRole('group').first()).toBeVisible();
  const report = await panel.evaluate((node) => {
    const pluses = [...node.querySelectorAll('[data-equation-plus]')];
    const aside = node.closest('aside, [class*="aside"]') ?? node;
    return {
      panelRight: Math.round(node.getBoundingClientRect().right),
      panelOverflowX: node.scrollWidth - node.clientWidth,
      asideOverflowX: aside.scrollWidth - aside.clientWidth,
      asideScrollsY: aside.scrollHeight - aside.clientHeight,
      pluses: pluses.map((plus) => {
        const unit = plus.parentElement;
        const term = plus.nextElementSibling;
        const a = plus.getBoundingClientRect();
        const b = term?.getBoundingClientRect();
        return { unitHasTerm: term !== null, sameUnit: unit === term?.parentElement, plusTop: Math.round(a.top), termTop: b === undefined ? null : Math.round(b.top), termRight: b === undefined ? null : Math.round(b.right), unitClass: unit?.className };
      }),
    };
  });
  expect(report.panelOverflowX).toBeLessThanOrEqual(0);
  for (const plus of report.pluses) {
    expect(plus.unitHasTerm).toBe(true);
    expect(plus.sameUnit).toBe(true);
    expect(plus.termTop === null ? Infinity : Math.abs(plus.termTop - plus.plusTop)).toBeLessThan(140); // on the term's own line
  }
  expect(report.pluses.every((plus) => plus.termRight !== null && plus.termRight <= report.panelRight)).toBe(true);
});
