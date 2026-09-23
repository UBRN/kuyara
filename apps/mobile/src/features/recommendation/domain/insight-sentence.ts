import { insightSentenceSchema } from '@kuyara/contracts';

const functionWords = {
  en: new Set(['a', 'an', 'and', 'as', 'at', 'for', 'from', 'in', 'is', 'of', 'on', 'the', 'to', 'with', 'your']),
  tr: new Set(['bir', 'bu', 'da', 'de', 'gibi', 'için', 'ile', 'ise', 've', 'ya', 'değil', 'olan', 'olarak', 'sana', 'senin']),
} as const;

const bannedContent = /workers ai|cloudflare|openrouter|llama|gpt|gemini|claude|mistral|qwen|deepseek|nvidia|meta|openai|apple intelligence|\bai\b|yapay zeka|http|www\.|\.com|\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/iu;
export function validateInsightSentence({
  sentence,
  locale,
}: Readonly<{
  sentence: unknown;
  locale: 'tr' | 'en';
}>): string | null {
  const parsed = insightSentenceSchema.safeParse(sentence);
  if (!parsed.success || bannedContent.test(parsed.data) || /\p{Decimal_Number}/u.test(parsed.data)) {
    return null;
  }

  const words = parsed.data.toLocaleLowerCase(locale).match(/\p{L}+/gu) ?? [];
  const hasFunctionWord = words.some((word) => functionWords[locale].has(word));
  const hasTurkishLetter = /[çğıöşüİ]/iu.test(parsed.data);
  if (locale === 'tr'
    ? !hasFunctionWord && !hasTurkishLetter
    : !hasFunctionWord || hasTurkishLetter) return null;

  return parsed.data;
}
