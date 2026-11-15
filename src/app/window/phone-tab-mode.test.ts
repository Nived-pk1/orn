import { describe, expect, it } from 'vitest';
import { modeAfterPhoneTab } from './phone-tab-mode';

describe('modeAfterPhoneTab', () => {
  it('leaves Settings for the tab pressed, and leaves every other mode alone', () => {
    const explorer = () => 'reagents';
    expect(modeAfterPhoneTab('settings', 'families', explorer)).toBe('navigator');
    expect(modeAfterPhoneTab('settings', 'map', explorer)).toBe('navigator');
    expect(modeAfterPhoneTab('settings', 'explore', explorer)).toBe('reagents');
    expect(modeAfterPhoneTab('settings', 'chapters', explorer)).toBe('chapters');
    expect(modeAfterPhoneTab('reactions', 'map', explorer)).toBe('reactions');
  });
});
