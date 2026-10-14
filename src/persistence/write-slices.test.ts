import { describe, expect, it } from 'vitest';
import type { AnyRecord } from '@/core/schema';
import { putInSlices, WRITE_SLICE_SIZE } from './write-slices';

const rows = Array.from({ length: WRITE_SLICE_SIZE * 3 + 5 }, (_, i) => ({ id: `r${i}` }) as unknown as AnyRecord);

describe('putInSlices', () => {
  it('issues every slice at once, in order, and reports as each slice succeeds: written rises to the total', async () => {
    const issued: string[][] = [];
    const finish: (() => void)[] = [];
    const reports: string[] = [];
    const done = putInSlices(
      {
        bulkPut: (slice) => {
          issued.push(slice.map((r) => r.id));
          return new Promise<void>((resolve) => finish.push(resolve));
        },
      },
      rows,
      (p) => reports.push(`${p.written}/${p.total}`),
    );
    // all four slices are already asked for, none is waited for first; nothing is reported before a slice succeeds
    expect(issued).toHaveLength(4);
    expect(issued.flat()).toEqual(rows.map((r) => r.id));
    expect(issued.map((s) => s.length)).toEqual([WRITE_SLICE_SIZE, WRITE_SLICE_SIZE, WRITE_SLICE_SIZE, 5]);
    expect(reports).toEqual([]);
    finish[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(reports).toEqual([`${WRITE_SLICE_SIZE}/${rows.length}`]);
    finish.slice(1).forEach((f) => f());
    await done;
    expect(reports).toEqual([`${WRITE_SLICE_SIZE}/${rows.length}`, `${WRITE_SLICE_SIZE * 2}/${rows.length}`, `${WRITE_SLICE_SIZE * 3}/${rows.length}`, `${rows.length}/${rows.length}`]);
  });

  it('a failing slice rejects the whole write with its error and the total is never reported', async () => {
    const reports: number[] = [];
    let calls = 0;
    await expect(
      putInSlices(
        { bulkPut: () => ((calls += 1) === 2 ? Promise.reject(new Error('slice 2 failed')) : Promise.resolve()) },
        rows,
        (p) => reports.push(p.written),
      ),
    ).rejects.toThrow('slice 2 failed');
    expect(reports).not.toContain(rows.length);
  });

  it('no rows: nothing is issued or reported', async () => {
    let calls = 0;
    await putInSlices({ bulkPut: () => ((calls += 1), Promise.resolve()) }, [], () => (calls += 100));
    expect(calls).toBe(0);
  });
});
