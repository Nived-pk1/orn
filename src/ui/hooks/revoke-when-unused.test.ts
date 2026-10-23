// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revokeWhenUnused, REVOKE_MAX_WAITS } from './revoke-when-unused';

const URL_A = 'blob:test/a';
const image = (src: string): HTMLImageElement => {
  const img = document.createElement('img');
  img.setAttribute('src', src);
  document.body.append(img);
  return img;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('revoking a blob URL only when no image shows it', () => {
  it('revokes at once when no image element uses the URL', () => {
    const revoke = vi.fn();
    revokeWhenUnused(revoke, URL_A);
    expect(revoke).toHaveBeenCalledWith(URL_A);
  });

  it('waits while an image still shows it and revokes once that image is gone', () => {
    const revoke = vi.fn();
    const img = image(URL_A);
    revokeWhenUnused(revoke, URL_A);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(revoke).not.toHaveBeenCalled();
    img.remove();
    vi.advanceTimersByTime(100);
    expect(revoke).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('is bounded: an image that never goes does not keep the URL forever', () => {
    const revoke = vi.fn();
    image(URL_A);
    revokeWhenUnused(revoke, URL_A);
    vi.advanceTimersByTime(REVOKE_MAX_WAITS * 1000);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('another image with a different URL does not hold it', () => {
    const revoke = vi.fn();
    image('blob:test/other');
    revokeWhenUnused(revoke, URL_A);
    expect(revoke).toHaveBeenCalledWith(URL_A);
  });
});
