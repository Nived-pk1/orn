/** The record's "⋯" menu (step 8.4g, G1 and G6): copy the record's link, and report a mistake by mail (only when the build has an address). */
import { formatAddress, recordAddress } from '@/ui/state';
import { Icon, Menu, useOptionalToasts } from '@/ui/primitives';
import type { RecordRef } from '@/core/schema';
import { mistakeMailto } from './report-mail';

export function RecordMenu(props: { readonly refOf: RecordRef; readonly name: string; readonly kindWord: string; readonly report?: { readonly address: string; readonly version: string } }) {
  const toasts = useOptionalToasts();
  const link = `${location.origin}${location.pathname}${formatAddress(recordAddress(props.refOf))}`;
  const copy = (): void => {
    const done = (text: string, kind?: 'error'): void => void toasts?.push({ text, ...(kind === undefined ? {} : { kind }) });
    const write = navigator.clipboard?.writeText(link);
    if (write === undefined) done('The link could not be copied', 'error');
    else write.then(() => done('Link copied'), () => done('The link could not be copied', 'error'));
  };
  const report = props.report;
  return (
    <Menu
      label="Record menu"
      trigger={<Icon name="more-horizontal" />}
      items={[
        { id: 'copy-link', label: 'Copy link', onSelect: copy },
        ...(report === undefined || report.address === '' ? [] : [{ id: 'report', label: 'Report a mistake', href: mistakeMailto({ address: report.address, name: props.name, kind: props.kindWord, link, version: report.version }) }]),
      ]}
    />
  );
}
