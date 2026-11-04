/**
 * The map's chapter select (step 8.2a, D2): "Chapter: All chapters / <each chapter>". On the desktop it sits in the map toolbar; on a phone it is a
 * native select (the platform's own picker) at least 44 px high. It only reports the choice: the saving and the drawing are the map's.
 */
import styles from './navigator.module.css';

export interface ChapterOption {
  readonly id: string;
  readonly title: string;
}

export function ChapterSelect(props: { readonly chapters: readonly ChapterOption[]; readonly value: string | null; readonly onChange: (id: string | null) => void; readonly phone?: boolean }) {
  const phone = props.phone === true;
  return (
    <label className={phone ? styles.chapterPhone : styles.chapter}>
      <span>Chapter:</span>
      <select aria-label="Chapter" className={styles.chapterSelect} value={props.value ?? ''} onChange={(event) => props.onChange(event.target.value === '' ? null : event.target.value)} {...(phone ? { 'data-phone': '' } : {})}>
        <option value="">All chapters</option>
        {props.chapters.map((chapter) => (
          <option key={chapter.id} value={chapter.id}>
            {chapter.title}
          </option>
        ))}
      </select>
    </label>
  );
}
