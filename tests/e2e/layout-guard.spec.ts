/**
 * The layout guard of the phone specs (step 8.1 review decision 2): a container marked data-scroll-row with overflow-x auto or scroll is
 * checked AS ONE BOX (it must lie inside the window) and its children are not checked sideways; an unmarked control outside the window still
 * fails; a marked row that sticks out of the window fails. Chromium only (it needs no app: the pages are made here).
 */
import { expect, test } from './fixtures';
import { layoutProblems } from './layout-guard';

const PAGE = (body: string): string => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:0}button{width:80px;height:44px}</style></head><body>${body}</body></html>`;
const ROW = (attrs: string, left = 0): string =>
  `<ul ${attrs} style="display:flex;gap:8px;margin:0;padding:0;list-style:none;overflow-x:auto;width:300px;position:relative;left:${left}px">${'<li><button>card</button></li>'.repeat(8)}</ul>`;

test.beforeEach(({ browserName }) => test.skip(browserName !== 'chromium', 'the guard is the same code in every engine'));

test('a marked scroll row inside the window passes although its cards run past the edge', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.setContent(PAGE(ROW('data-scroll-row')));
  expect(await layoutProblems(page)).toEqual([]);
});

test('an unmarked row whose cards run past the edge still fails', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.setContent(PAGE(ROW('')));
  expect((await layoutProblems(page)).some((p) => p.startsWith('control outside the window sideways'))).toBe(true);
});

test('an unmarked control outside the window fails', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.setContent(PAGE('<div style="position:absolute;left:400px;top:10px"><button>lost</button></div>'));
  expect((await layoutProblems(page)).some((p) => p.startsWith('control outside the window sideways'))).toBe(true);
});

test('a marked row that sticks out of the window fails, checked as one box', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.setContent(PAGE(ROW('data-scroll-row', 120)));
  expect((await layoutProblems(page)).some((p) => p.startsWith('scroll row outside the window sideways'))).toBe(true);
});

test('a marked element without overflow-x auto or scroll is not a scroll row: its children are checked', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.setContent(PAGE(`<ul data-scroll-row style="display:flex;gap:8px;margin:0;padding:0;list-style:none;width:300px">${'<li><button>card</button></li>'.repeat(8)}</ul>`));
  expect((await layoutProblems(page)).some((p) => p.startsWith('control outside the window sideways'))).toBe(true);
});
