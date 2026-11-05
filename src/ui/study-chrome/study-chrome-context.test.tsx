// @vitest-environment jsdom
/** Components read the rule from a context; without a provider they get Studio's (everything shown), so every existing test keeps its meaning. */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { STUDIO_CHROME, studyChrome } from './study-chrome';
import { StudyChromeProvider, useStudyChrome } from './study-chrome-context';

describe('useStudyChrome', () => {
  it('is Studio\'s rule without a provider', () => {
    expect(renderHook(() => useStudyChrome()).result.current).toBe(STUDIO_CHROME);
  });
  it('is the provided rule', () => {
    const value = studyChrome('study', { ownData: false });
    const wrapper = ({ children }: { readonly children: ReactNode }) => <StudyChromeProvider value={value}>{children}</StudyChromeProvider>;
    expect(renderHook(() => useStudyChrome(), { wrapper }).result.current).toBe(value);
  });
});
