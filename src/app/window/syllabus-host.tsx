/**
 * The Syllabus view on the canvas (step 7.6, ADR-042): the app composes the feature with the inspector's rich text renderer (the official
 * wording of a unit), so the features never import each other. Its own lazy chunk in BOTH editions. The edition decides the wording of a gap
 * row and whether "Gaps only" is offered (Studio). Nothing here edits a record, and the exam scope is only read.
 */
import { useMemo } from 'react';
import { EDITING } from '@/app/edition';
import { SyllabusView, type SyllabusPorts } from '@/features/syllabus';
import { InspectorRichText } from '@/features/inspector';
import { useNavigator } from '@/features/navigator';
import { useApp } from './context';

export function SyllabusHost(props: { readonly openPane: () => void; readonly onChapter: (chapterId: string) => void }) {
  const { openPane, onChapter } = props;
  const { inspector } = useApp();
  const { ports } = useNavigator();
  const syllabus = useMemo<SyllabusPorts>(
    () => ({
      store: ports.store,
      ui: { syllabus: ports.ui.syllabus, exam: ports.ui.exam },
      renderRichText: (source) => <InspectorRichText ports={inspector} openPane={openPane} source={source} />,
      openChapter: onChapter,
      timers: ports.timers,
      log: ports.log,
      editing: EDITING,
    }),
    [ports, inspector, openPane, onChapter],
  );
  return <SyllabusView ports={syllabus} />;
}
