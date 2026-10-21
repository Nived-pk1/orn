/**
 * A NEW topic's and a NEW map family's order start at "after the last": the highest order among its siblings (the topics under the same
 * parent, the families of the same group) plus 1, shown and editable (exams step part A, P1). A display position, not chemistry. A stored
 * record always has an order, so an empty order means a new record. Once the person has typed in the field the default is never applied
 * again; until then it follows the siblings (a new parent or group).
 */
import { useEffect, useRef } from 'react';

export const afterLast = (siblingOrders: readonly number[]): number => (siblingOrders.length === 0 ? 1 : Math.max(...siblingOrders) + 1);

export function useAfterLastOrder(order: number | undefined, siblingOrders: readonly number[], set: (value: number) => void): (value: number | undefined) => void {
  const touched = useRef(false);
  const auto = useRef<number | undefined>(undefined);
  const wanted = afterLast(siblingOrders);
  useEffect(() => {
    if (touched.current) return;
    if (order === undefined || order === auto.current) {
      if (order !== wanted) set(wanted);
      auto.current = wanted;
    }
  }, [order, wanted, set]);
  return (value) => {
    touched.current = true;
    auto.current = undefined;
    void value;
  };
}
