import { insightSentenceSchema } from '@kuyara/contracts';

/**
 * The fewest words a sentence the Worker sends may have. The prompt asks for five to ten;
 * one word of slack keeps a short but complete Turkish sentence, while a bare subject and
 * verb such as "Kadınlar giydiler." says nothing about the day or the outfits.
 */
const minimumWords = 4;

/**
 * Words that cannot end a sentence in English or Turkish: conjunctions, articles and
 * prepositions or postpositions that leave the clause open.
 */
const openClauseWords = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on',
  'or', 'than', 'the', 'to', 'with', 'without', 'your',
  'ama', 'ancak', 'fakat', 'gibi', 'hem', 'ile', 'için', 'ki', 've', 'veya', 'ya',
]);

function isComplete(sentence: string): boolean {
  // The provider schema caps the string at 90 characters, so a model that runs long is cut
  // mid-clause, and the cut text has no closing mark.
  const closing = /^(.*\S)\s*[.!?]$/su.exec(sentence);
  if (!closing) return false;
  const words = closing[1]!.split(/\s+/u);
  const lastWord = words.at(-1)!.toLowerCase();
  return words.length >= minimumWords && !openClauseWords.has(lastWord);
}

/**
 * The insight sentence the Worker sends: the shared schema, plus a complete sentence of at
 * least four words that closes with a period, an exclamation or a question mark and does not
 * end on a word that leaves the clause open. The handler applies it before the response, so
 * it protects every installed build at once: a failing sentence is dropped, and the build
 * shows its deterministic line (ADR 0039).
 */
export const completeInsightSentenceSchema = insightSentenceSchema.refine(
  isComplete,
  'Insight must be a complete sentence of at least four words.',
);
