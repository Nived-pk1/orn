import { expect, it } from 'vitest';
import { STAR_LIMIT } from './my-records-rule';
import { STAR_FULL_TEXT } from './use-toggle-star';

it('the "full" words name the same limit the rule keeps', () => {
  expect(STAR_FULL_TEXT).toBe(`You can star up to ${STAR_LIMIT} records`);
});
