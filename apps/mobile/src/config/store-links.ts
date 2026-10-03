export const IOS_STORE_URL = 'https://apps.apple.com/app/kuyara/id6806664440';
export const IOS_REVIEW_URL = `${IOS_STORE_URL}?action=write-review`;
export const LICENCE_URL = 'https://polyformproject.org/licenses/noncommercial/1.0.0';

export function androidStoreLinks(packageName: string) {
  const id = encodeURIComponent(packageName);
  return {
    share: `https://play.google.com/store/apps/details?id=${id}`,
    review: `market://details?id=${id}`,
  };
}
