/**
 * The picture inside "Open full size" (step 6.5b follow-up G1): fitted into the free area of the dialog and centred both ways, enlarged
 * at most 2x its natural size, shrunk when too large (`model/fit-picture.ts`). Measured when the picture has loaded and again when the
 * window is resized. Until measured it is only kept inside the stage (CSS), so nothing jumps.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fitPicture, type PixelSize } from './model/fit-picture';
import styles from './inspector.module.css';

export function FullPicture(props: { readonly url: string; readonly alt: string }) {
  const stage = useRef<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<PixelSize | undefined>(undefined);
  const [area, setArea] = useState<PixelSize | undefined>(undefined);
  const measure = useCallback(() => {
    const node = stage.current;
    if (node !== null) setArea({ width: node.clientWidth, height: node.clientHeight });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);
  const fitted = natural === undefined || area === undefined ? undefined : fitPicture(natural, area);
  return (
    <div className={styles.fullStage} data-picture-stage="" ref={stage}>
      <img
        className={styles.fullPicture}
        src={props.url}
        alt={props.alt}
        style={fitted === undefined ? undefined : { width: `${fitted.width}px`, height: `${fitted.height}px` }}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          setNatural({ width: naturalWidth, height: naturalHeight });
          measure();
        }}
      />
    </div>
  );
}
