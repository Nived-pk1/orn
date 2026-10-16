/** A few monochrome line icons (UI_ARCHITECTURE §3: no emoji icons). Decorative: `aria-hidden`; the control carries the name. */
export type IconName = 'close' | 'menu' | 'inspector' | 'undo' | 'redo' | 'search' | 'import' | 'chevron-down' | 'families' | 'map' | 'fit' | 'info';

const PATHS: Readonly<Record<IconName, string>> = {
  close: 'M4 4l8 8M12 4l-8 8',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  inspector: 'M2.5 3h11v10h-11zM10 3v10',
  undo: 'M6 3L3 6l3 3M3 6h6a4 4 0 010 8H6',
  redo: 'M10 3l3 3-3 3M13 6H7a4 4 0 000 8h3',
  search: 'M7 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM10.5 10.5l3 3',
  import: 'M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10',
  'chevron-down': 'M4 6l4 4 4-4',
  families: 'M2.5 2.5h11v4.5h-11zM2.5 9h11v4.5h-11z',
  map: 'M2.5 3h4v3.5h-4zM9.5 9.5h4V13h-4zM6.5 4.75h3v4.75M9.5 11.25h-1.5',
  fit: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  info: 'M8 2a6 6 0 100 12A6 6 0 008 2zM8 7.2V11M8 5v.2',
};

export function Icon(props: { readonly name: IconName; readonly size?: number }) {
  const size = props.size ?? 16;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[props.name]} />
    </svg>
  );
}
