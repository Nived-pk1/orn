/**
 * The layer stack (step 5.2, UI_ARCHITECTURE §11): Esc closes the TOPMOST layer only. A layer that opens registers itself and gets a
 * function that says whether it is on top; Radix menus and tooltips run their own Esc handling, and the native `<dialog>` asks this
 * stack. A module-level list, bounded by the number of layers that are open at once (a few); no DOM, no React.
 */
const stack: string[] = [];

/** Registers a layer as the new top. Returns the function that removes it (safe twice). */
export function pushLayer(id: string): () => void {
  stack.push(id);
  return () => {
    const at = stack.lastIndexOf(id);
    if (at >= 0) stack.splice(at, 1);
  };
}

export function isTopLayer(id: string): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/** How many layers are open (tests, and the shell's "something modal is open"). */
export function openLayers(): number {
  return stack.length;
}
