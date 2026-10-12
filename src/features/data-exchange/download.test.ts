// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, REVOKE_AFTER_MS } from './download';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('downloadBlob', () => {
  it('clicks a hidden anchor with the download name, removes it, and revokes the object URL after', () => {
    vi.useFakeTimers();
    const seen: { download: string; href: string; rel: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      seen.push({ download: this.download, href: this.getAttribute('href') ?? '', rel: this.rel });
      expect(document.body.contains(this)).toBe(true);
    });
    const urls = { createObjectURL: vi.fn(() => 'blob:abc'), revokeObjectURL: vi.fn() };
    const blob = new Blob(['{}'], { type: 'application/json' });
    downloadBlob(blob, 'a.orn.json', document, urls);
    expect(urls.createObjectURL).toHaveBeenCalledWith(blob);
    expect(seen).toEqual([{ download: 'a.orn.json', href: 'blob:abc', rel: 'noopener' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(urls.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:abc');
  });

  it('revokes the URL even when the click throws', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    const urls = { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() };
    expect(() => downloadBlob(new Blob(['x']), 'a.json', document, urls)).toThrow('blocked');
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
});
