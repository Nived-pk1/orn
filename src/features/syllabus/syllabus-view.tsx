/**
 * The Syllabus view (step 7.6 D): one exam version's syllabus, unit by unit, with the topics it covers, how much content each has and where
 * the gaps are; optionally what changed against another version of the same exam. The page, the totals and the difference are the core's
 * (`@/core/syllabus`); this file draws and edits UI state (the chosen version, the one compared with, "Gaps only"; saved, never records).
 * The version select does NOT change the app's exam scope. A saved choice that names nothing is dropped and said once. No chemistry here.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { syllabusDiff, syllabusPage } from '@/core/syllabus';
import { useLayoutMode } from '@/ui/hooks';
import type { SyllabusPorts } from './contracts';
import { Changes } from './changes';
import { defaultVersionId, effectiveWords, gapsOnly, rowsOf, statusWords, totalsWords, UNITS_PAGE, versionGroups } from './model';
import { UnitSection } from './unit-section';
import styles from './syllabus-view.module.css';

export function SyllabusView(props: { readonly ports: SyllabusPorts }) {
  const { ports } = props;
  const saved = useStore(ports.ui.syllabus, (s) => s);
  const active = useStore(ports.ui.exam, (s) => s.active);
  const phone = useLayoutMode() === 'phone';
  const [version, setVersion] = useState(0);
  const [unitLimit, setUnitLimit] = useState(UNITS_PAGE);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  useEffect(() => ports.store.subscribe(() => setVersion((v) => v + 1)), [ports]);

  // `version` makes a new snapshot when the data moved
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => ports.store.getState(), [ports, version]);
  const groups = useMemo(() => versionGroups(state), [state]);
  const known = useMemo(() => new Map(groups.flatMap((g) => g.versions.map((v) => [v.id, v] as const))), [groups]);
  const fallback = defaultVersionId(groups, active?.examVersionId);
  const savedUnknown = saved.versionId !== null && !known.has(saved.versionId);
  const versionId = saved.versionId !== null && known.has(saved.versionId) ? saved.versionId : fallback;
  const chosen = versionId === undefined ? undefined : known.get(versionId);
  const siblings = useMemo(() => (chosen === undefined ? [] : (groups.find((g) => g.examId === chosen.examId)?.versions ?? []).filter((v) => v.id !== chosen.id)), [groups, chosen]);
  const compareUnknown = saved.compareId !== null && (chosen === undefined || !siblings.some((v) => v.id === saved.compareId));
  const compareId = saved.compareId !== null && !compareUnknown ? saved.compareId : null;

  useEffect(() => {
    if (savedUnknown) {
      ports.ui.syllabus.getState().setVersion(null);
      setNotice(`The version you had chosen is not in this data, so ${chosen?.label ?? 'none'} is shown.`);
      ports.log('syllabus_version_pruned', 'a saved exam version id names nothing any more; the default version is shown');
    } else if (compareUnknown) {
      ports.ui.syllabus.getState().setCompare(null);
      setNotice('The version you were comparing with is not available, so no comparison is shown.');
      ports.log('syllabus_compare_pruned', 'a saved comparison names a version that is not of this exam; the comparison was dropped');
    }
  }, [savedUnknown, compareUnknown, chosen, ports]);

  const page = useMemo(() => (versionId === undefined ? undefined : syllabusPage(state, versionId)), [state, versionId]);
  const diff = useMemo(() => (versionId === undefined || compareId === null ? undefined : syllabusDiff(state, versionId, compareId)), [state, versionId, compareId]);
  const topicName = (id: string): string => state.records.topic[id]?.name ?? id;
  const isChapter = (id: string): boolean => state.records.topic[id]?.topicKind === 'chapter';
  const dated = page === undefined ? undefined : effectiveWords(page.effectiveFrom, page.effectiveTo);

  const gaps = ports.editing && saved.gapsOnly && page !== undefined ? gapsOnly(page.units) : undefined;
  const unitRows = page === undefined ? [] : gaps !== undefined ? gaps : page.units.map((unit) => ({ unit, rows: rowsOf(unit) }));
  const shownUnits = unitRows.slice(0, unitLimit);

  return (
    <section className={`${styles.view} ${phone ? styles.phone : ''}`} aria-label="Syllabus" data-syllabus-view="" data-layout={phone ? 'phone' : 'desktop'}>
      <h2 className={styles.title}>Syllabus</h2>
      {notice === undefined ? null : (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {chosen === undefined || page === undefined ? (
        <p className={styles.muted}>There is no exam version in this data yet.</p>
      ) : (
        <>
          <div className={styles.bar}>
            <label className={styles.field}>
              <span>Exam version</span>
              <select value={chosen.id} onChange={(event) => ports.ui.syllabus.getState().setVersion(event.target.value)}>
                {groups.map((group) => (
                  <optgroup key={group.examId} label={group.examName}>
                    {group.versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {siblings.length === 0 ? null : (
              <label className={styles.field}>
                <span>Compare with</span>
                <select value={compareId ?? ''} onChange={(event) => ports.ui.syllabus.getState().setCompare(event.target.value === '' ? null : event.target.value)}>
                  <option value="">No comparison</option>
                  {siblings.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {ports.editing ? (
              <label className={styles.option}>
                <input type="checkbox" checked={saved.gapsOnly} onChange={(event) => ports.ui.syllabus.getState().setGapsOnly(event.target.checked)} />
                Gaps only
              </label>
            ) : null}
          </div>
          <p className={styles.muted}>
            <span>{statusWords(page.status)}</span>
            {dated === undefined ? null : <span>{` · ${dated}`}</span>}
          </p>
          <p className={styles.muted}>{totalsWords(page.totals)}</p>
          {diff === undefined || !diff.ok ? null : (
            <Changes labelA={page.label} added={diff.added} removed={diff.removed} changed={diff.changed} empty={diff.empty} chapterName={topicName} isChapter={isChapter} openChapter={ports.openChapter} />
          )}
          {page.units.length === 0 ? <p className={styles.muted}>This version has no unit yet.</p> : null}
          {gaps !== undefined && gaps.length === 0 && page.units.length > 0 ? <p className={styles.muted}>No gaps: every covered topic has content.</p> : null}
          {shownUnits.map(({ unit, rows }) => (
            <UnitSection key={unit.id} ports={ports} unit={unit} rows={rows} phone={phone} chapterName={topicName} showExcluded={gaps === undefined} />
          ))}
          {unitRows.length > shownUnits.length ? (
            <div className={styles.more}>
              <p className={styles.muted} role="status">{`Showing ${shownUnits.length} of ${unitRows.length} units`}</p>
              <button type="button" onClick={() => setUnitLimit((n) => n + UNITS_PAGE)}>{`Show ${UNITS_PAGE} more units`}</button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
