import { localeTag } from '@/localization/locale-tag';
import type { SupportedLanguage } from '@/localization/messages';

const numberWords: Readonly<Record<SupportedLanguage, readonly string[]>> = {
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  tr: ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on'],
};

/**
 * A count the copy spells as a word, for a limit a rule owns: "three" and "üç" up to ten, the
 * digits beyond. The copy takes the number from its owner, so a changed rule changes the text.
 */
export function numberWord(value: number, language: SupportedLanguage): string {
  return numberWords[language][value] ?? String(value);
}

/** The same word opening a sentence. Turkish capitalizes with its own dotted and dotless i. */
export function capitalizedNumberWord(value: number, language: SupportedLanguage): string {
  const word = numberWord(value, language);
  return word.charAt(0).toLocaleUpperCase(localeTag(language)) + word.slice(1);
}
