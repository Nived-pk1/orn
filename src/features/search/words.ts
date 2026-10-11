/** What a hit matched, in words (step 5.8; SEARCH §3): name, alias, formula, derived formula, structure text, tag or notes. Pure. */
import type { SearchHit } from '@/search/contracts';
import type { HitFacts } from './contracts';

const quoted = (text: string): string => `“${text}”`;

export function matchWords(hit: SearchHit, facts: HitFacts): string {
  const text = hit.matchedText;
  switch (hit.matchedField) {
    case 'name':
      return text === undefined || text === hit.title ? 'Matched the name' : `Matched the name ${quoted(text)}`;
    case 'alias':
      return text === undefined ? 'Matched an alias' : `Matched the alias ${quoted(text)}`;
    case 'formula': {
      const derived = text !== undefined && text === facts.derivedFormula && text !== facts.enteredFormula;
      const word = derived ? 'derived formula' : 'formula';
      return text === undefined ? `Matched the ${word}` : `Matched the ${word} ${quoted(text)}`;
    }
    case 'structure':
      return 'Matched the structure text';
    case 'tag':
      return text === undefined ? 'Matched a tag' : `Matched the tag ${quoted(text)}`;
    case 'text':
      return 'Matched in the notes';
  }
}
