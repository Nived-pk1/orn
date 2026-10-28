/**
 * The compact row's equation in text (step 7.2a, A3; shared by the compact rows of the Reactions view and of the Precursors view): one part per outcome group, each with its heading when the reaction has several
 * ("At 278 K: 2 Ethanal → 3-Hydroxybutanal (major); At 293 K: ..."), so no two parts read the same. A group with no equation is left out.
 */
export function compactEquationOf(groups: readonly { readonly heading: string; readonly equation?: { readonly text: string } | undefined }[]): string {
  const several = groups.length > 1;
  return groups
    .flatMap((group) => {
      const text = group.equation?.text ?? '';
      if (text === '') return [];
      return [several && group.heading !== '' ? `${group.heading}: ${text}` : text];
    })
    .join('; ');
}
