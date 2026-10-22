/** E1 (exams step review): a topic-coverage row is one visibly grouped block; on a phone the topic's name has its own line. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./exam-rows.module.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bodyOf = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('exam-rows.module.css (E1)', () => {
  it('a coverage row is one bordered flex block', () => {
    expect(bodyOf('.coverageRow')).toMatch(/border/);
    expect(bodyOf('.coverageRow')).toMatch(/display:\s*flex/);
  });
  it('on a phone the name takes its own line', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 899px)'));
    expect(phone).toMatch(/\.topicName\s*\{[^}]*flex:\s*1 1 100%/);
  });
});
