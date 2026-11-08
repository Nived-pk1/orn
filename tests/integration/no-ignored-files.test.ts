/**
 * Nothing the app needs may be hidden by .gitignore (housekeeping after 8.4b): `src/core/coverage/` was ignored by an unanchored `coverage/`
 * line, so tracked code imported files no clone had. This lists every ignored, untracked file in the source folders: there must be none.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const FOLDERS = ['src', 'tests', 'scripts', 'docs', 'data', 'public'];

describe('.gitignore hides nothing in the source folders', () => {
  it('git ls-files --others --ignored --exclude-standard lists no file in src, tests, scripts, docs, data or public', () => {
    const out = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...FOLDERS], { encoding: 'utf8' });
    expect(out.split('\n').filter((line) => line.trim() !== '')).toEqual([]);
  });
});
