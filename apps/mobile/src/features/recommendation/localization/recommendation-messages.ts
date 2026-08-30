import type { OutfitArchetypeId } from '@kuyara/contracts';

export type RecommendationMessages = Readonly<{
  archetypes: Readonly<Record<OutfitArchetypeId, string>>;
}>;

const en: RecommendationMessages = {
  archetypes: {
    everyday_easy: 'Easy Everyday',
    smart_casual: 'Smart Casual',
    office_ready: 'Office Ready',
    weekend_relaxed: 'Weekend Relaxed',
    layered_warmth: 'Layered Warmth',
    cold_shield: 'Cold Shield',
    rain_ready: 'Rain Ready',
    snow_day: 'Snow Day',
    wind_guard: 'Wind Guard',
    light_and_airy: 'Light and Airy',
    on_the_move: 'On the Move',
    in_between: 'In-Between',
  },
};

const tr: RecommendationMessages = {
  archetypes: {
    everyday_easy: 'Günlük Rahat',
    smart_casual: 'Şık Günlük',
    office_ready: 'Ofise Uygun',
    weekend_relaxed: 'Hafta Sonu',
    layered_warmth: 'Katmanlı Sıcaklık',
    cold_shield: 'Soğuğa Karşı',
    rain_ready: 'Yağmura Hazır',
    snow_day: 'Karlı Gün',
    wind_guard: 'Rüzgara Karşı',
    light_and_airy: 'Hafif ve Ferah',
    on_the_move: 'Hareketli Gün',
    in_between: 'Değişken Hava',
  },
};

export const recommendationMessages: Readonly<{
  en: RecommendationMessages;
  tr: RecommendationMessages;
}> = Object.freeze({ en: Object.freeze(en), tr: Object.freeze(tr) });
