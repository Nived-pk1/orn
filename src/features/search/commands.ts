/** Filtering the command list for "> text" (step 5.8). Commands are listed, unavailable ones with their reason, never hidden. */
import { fold } from '@/core/text';
import type { PaletteCommand } from './contracts';

/** Commands whose title or keywords contain every word of the text (folded); no text lists all. Registry order is kept. */
export function filterCommands(commands: readonly PaletteCommand[], text: string): readonly PaletteCommand[] {
  const words = fold(text).split(' ').filter((word) => word !== '');
  if (words.length === 0) return commands;
  return commands.filter((command) => {
    const haystack = fold([command.title, ...(command.keywords ?? [])].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}
