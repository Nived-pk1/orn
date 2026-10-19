/**
 * Local time for the words people read (step 6.1 review): a stored time is UTC ISO, but people read it in their own zone.
 * The zone is injected (no zone: the machine's own), so a test pins one and the words never depend on where it runs.
 */
export type TimeFormatter = (iso: string) => string;

export function createLocalTimeFormatter(timeZone?: string): TimeFormatter {
  const format = new Intl.DateTimeFormat('en-US', {
    ...(timeZone === undefined ? {} : { timeZone }),
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return (iso) => {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return iso;
    const part = (type: Intl.DateTimeFormatPartTypes): string => format.formatToParts(at).find((p) => p.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')} ${part('timeZoneName')}`;
  };
}
