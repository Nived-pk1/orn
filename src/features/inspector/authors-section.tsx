/**
 * "For authors" (step 8.1 Part C): everything the old levels 2 to 5 showed, in Studio only, behind a closed section. Its own chunk:
 * nothing of it is loaded until an author opens the section. The old sub-headings stay inside, so no author information is lost.
 */
import type { AnyRecord } from '@/core/schema';
import type { Finding } from '@/core/validation';
import { LevelSection } from './levels';
import { ProvenanceLevel } from './provenance';
import { KindLevels } from './views';

export function AuthorsSection(props: { readonly record: AnyRecord; readonly findings: readonly Finding[] }) {
  return (
    <div data-sheet-full="">
      <KindLevels record={props.record} findings={props.findings} />
      <LevelSection level={5} title="Provenance, findings and raw record">
        <ProvenanceLevel record={props.record} findings={props.findings} />
      </LevelSection>
    </div>
  );
}
