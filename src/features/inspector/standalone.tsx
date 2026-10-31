/**
 * The inspector's text and pictures drawn OUTSIDE the inspector (step 7.3b D3): a chapter page's study card shows a record's rich text and
 * pictures the way the inspector does. The app hands the inspector's own ports in; a record link in the text focuses that record in the
 * inspector. Nothing is edited here.
 */
import type { ReactNode } from 'react';
import type { RecordRef } from '@/core/schema';
import type { InspectorHost, InspectorPorts } from './contracts';
import { InspectorEnvContext, makeEnv } from './env';
import { RichText } from './rich-text';
import { RecordPictures } from './view-pictures';

const NO_ENDS = (): undefined => undefined;

function Scope(props: { readonly ports: InspectorPorts; readonly openPane: () => void; readonly children: ReactNode }) {
  const { ports, openPane } = props;
  const host: InspectorHost = { openPane, navigatorShown: false, edgeEnds: NO_ENDS };
  const open = (ref: RecordRef, at?: string): void => {
    ports.ui.inspector.getState().open(ref, at);
    openPane();
  };
  return <InspectorEnvContext.Provider value={makeEnv(ports, host, ports.store.getState(), open)}>{props.children}</InspectorEnvContext.Provider>;
}

export function InspectorRichText(props: { readonly ports: InspectorPorts; readonly openPane: () => void; readonly source: string | undefined }) {
  return (
    <Scope ports={props.ports} openPane={props.openPane}>
      <RichText source={props.source} />
    </Scope>
  );
}

export function InspectorPictures(props: { readonly ports: InspectorPorts; readonly openPane: () => void; readonly target: RecordRef }) {
  return (
    <Scope ports={props.ports} openPane={props.openPane}>
      <RecordPictures target={props.target} />
    </Scope>
  );
}
