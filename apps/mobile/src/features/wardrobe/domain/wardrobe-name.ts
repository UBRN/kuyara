/** The longest Closet name the form takes, in UTF-16 units (what the text field counts); the account holds a name of up to 800 bytes (at most 3 per unit). */
export const WARDROBE_NAME_MAX_LENGTH = 200;

const isHighSurrogate = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLowSurrogate = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;
const isRegionalIndicator = (codePoint: number) => codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
const zeroWidthJoiner = 0x200d;

// A code point that continues the cluster before it: any mark (combining marks, variation
// selectors, the keycap), a joiner, an emoji skin tone, a tag character of a subdivision flag,
// or a Hangul vowel or final consonant jamo.
const continuesCluster = /^[\p{M}\u{200c}\u{200d}\u{1160}-\u{11ff}\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}]/u;

/** The code point that ends just before `index`. */
function codePointBefore(text: string, index: number): number {
  const unit = text.charCodeAt(index - 1);
  return isLowSurrogate(unit) && index >= 2 && isHighSurrogate(text.charCodeAt(index - 2))
    ? text.codePointAt(index - 2) ?? unit
    : unit;
}

/**
 * Whether cutting `text` before `index` splits no character, mark, emoji sequence or flag. A conservative
 * rule instead of `Intl.Segmenter`, which the shipped engine is not relied on to provide: no cut
 * inside a surrogate pair, before a continuing code point, after a joiner, or between the two
 * halves of a regional-indicator flag. A rule too cautious only keeps a few units less.
 */
function keepsClustersWhole(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return true;
  if (isHighSurrogate(text.charCodeAt(index - 1)) && isLowSurrogate(text.charCodeAt(index))) return false;
  if (continuesCluster.test(String.fromCodePoint(text.codePointAt(index) ?? 0))) return false;
  if (codePointBefore(text, index) === zeroWidthJoiner) return false;
  let indicators = 0;
  for (let at = index; at > 0; ) {
    const before = codePointBefore(text, at);
    if (!isRegionalIndicator(before)) break;
    indicators += 1;
    at -= 2;
  }
  return indicators % 2 === 0;
}

/**
 * A Closet name of at most `WARDROBE_NAME_MAX_LENGTH` UTF-16 units: a name at or under the limit
 * is returned unchanged; a longer one is cut at the last place `keepsClustersWhole` accepts, and
 * its trailing whitespace dropped. A cluster longer than the limit by itself cannot
 * stay whole, so that name is cut at the last whole character instead of emptied.
 * Migration 29 calls this function: a change to its behaviour needs a new migration.
 */
export function shortenWardrobeName(name: string): string {
  if (name.length <= WARDROBE_NAME_MAX_LENGTH) return name;
  let cut = WARDROBE_NAME_MAX_LENGTH;
  while (cut > 0 && !keepsClustersWhole(name, cut)) cut -= 1;
  const whole = name.slice(0, cut).trimEnd();
  if (whole.length > 0) return whole;
  const pairSafe = isHighSurrogate(name.charCodeAt(WARDROBE_NAME_MAX_LENGTH - 1))
    ? WARDROBE_NAME_MAX_LENGTH - 1 : WARDROBE_NAME_MAX_LENGTH;
  return name.slice(0, pairSafe);
}
