import type {
  ClothingItemCode,
  ClothingSlotCode,
  ClothingStrategyCode,
  OutfitEmphasis,
  OutfitIntentCode,
  RecommendationReasonCode,
  TodayLocationCode,
  WeatherConditionCode,
} from '@/features/today/model';
import {
  catalogMessages,
  type CatalogMessages,
} from '@/features/catalog/localization/catalog-messages';

type OutfitCopy = Readonly<{
  title: string;
  description: string;
}>;

export type TodayMessages = Readonly<{
  title: string;
  settingsAction: string;
  settingsHint: string;
  weatherHeading: string;
  guidanceHeading: string;
  outfitsHeading: string;
  outfitsSupportingText: string;
  piecesHeading: string;
  reasonsHeading: string;
  locations: Readonly<Record<TodayLocationCode, string>>;
  conditions: Readonly<Record<WeatherConditionCode, string>>;
  strategies: Readonly<Record<ClothingStrategyCode, string>>;
  outfits: Readonly<Record<OutfitIntentCode, OutfitCopy>>;
  slots: Readonly<Record<ClothingSlotCode, string>>;
  items: Readonly<Record<ClothingItemCode, string>>;
  reasons: Readonly<Record<RecommendationReasonCode, string>>;
  emphasis: Readonly<Record<OutfitEmphasis, string>>;
  updatedAt: (time: string) => string;
  staleAt: (time: string) => string;
  apparentTemperature: (temperature: string) => string;
  temperatureRange: (minimum: string, maximum: string) => string;
  rainProbability: (probability: string) => string;
  optionPosition: (position: number, total: number) => string;
  loadingTitle: string;
  loadingBody: string;
  loadingAccessibilityLabel: string;
  unavailableTitle: string;
  unavailableBody: string;
  weatherAccessibilityLabel: (values: {
    condition: string;
    current: number;
    apparent: number;
    minimum: number;
    maximum: number;
    rainProbability: number;
  }) => string;
  outfitAccessibilityLabel: (values: {
    position: number;
    total: number;
    title: string;
    description: string;
    pieces: string;
    reasons: string;
  }) => string;
}>;

export type PreferenceMessages = Readonly<{
  clothingTitle: string;
  clothingDescription: string;
  womensClothing: string;
  mensClothing: string;
  languageTitle: string;
  languageDescription: string;
  languageSystem: string;
  languageTurkish: string;
  languageEnglish: string;
  themeTitle: string;
  themeDescription: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
}>;

export type AppMessages = Readonly<{
  catalog: CatalogMessages;
  common: Readonly<{
    back: string;
    continue: string;
  }>;
  navigation: Readonly<{
    today: string;
    weather: string;
    wardrobe: string;
    settings: string;
  }>;
  bootstrap: Readonly<{
    loadingTitle: string;
    loadingBody: string;
    errorTitle: string;
    errorBody: string;
  }>;
  onboarding: Readonly<{
    stepPosition: (position: number, total: number) => string;
    welcomeTitle: string;
    welcomeBody: string;
    promiseHeading: string;
    weatherPromise: string;
    outfitsPromise: string;
    wardrobePromise: string;
    clothingTitle: string;
    clothingBody: string;
    detailsTitle: string;
    detailsBody: string;
    completeAction: string;
    clothingRequiredError: string;
    saveError: string;
  }>;
  preferences: PreferenceMessages;
  settings: Readonly<{
    title: string;
    introduction: string;
    saving: string;
    saveError: string;
  }>;
  weather: Readonly<{
    title: string;
    placeholderBody: string;
  }>;
  wardrobe: Readonly<{
    title: string;
    addAction: string;
    addHint: string;
    emptyTitle: string;
    emptyBody: string;
    emptyAction: string;
    loadingLabel: string;
    loadErrorTitle: string;
    loadErrorBody: string;
    retryAction: string;
    itemHint: string;
    unclassifiedType: string;
    itemAccessibilityLabel: (values: {
      name: string | null;
      type: string;
      category: string;
      color: string | null;
    }) => string;
    newTitle: string;
    editTitle: string;
    backAction: string;
    nameLabel: string;
    nameDescription: string;
    namePlaceholder: string;
    photoTitle: string;
    photoDescription: string;
    photoEmptyBody: string;
    selectPhotoAction: string;
    changePhotoAction: string;
    removePhotoAction: string;
    photoProcessingLabel: string;
    photoError: string;
    photoAccessibilityLabel: (type: string) => string;
    typeTitle: string;
    typeDescription: string;
    typeRequiredError: string;
    colorTitle: string;
    colorDescription: string;
    colorUnspecified: string;
    attributesTitle: string;
    attributesDescription: string;
    attributeDefault: (value: string) => string;
    attributeLabels: Readonly<{
      thermalLevelOverride: string;
      waterProtectionOverride: string;
      windProtectionOverride: string;
      breathabilityOverride: string;
      armCoverageOverride: string;
      legCoverageOverride: string;
      tractionSuitabilityOverride: string;
    }>;
    saveAction: string;
    savingLabel: string;
    createError: string;
    updateError: string;
    typeChangeTitle: string;
    typeChangeBody: string;
    keepTypeAction: string;
    changeTypeAction: string;
    discardTitle: string;
    discardBody: string;
    keepEditingAction: string;
    discardAction: string;
    deleteSectionTitle: string;
    deleteSectionBody: string;
    deleteAction: string;
    deletingLabel: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    cancelDeleteAction: string;
    confirmDeleteAction: string;
    deleteError: string;
    notFoundTitle: string;
    notFoundBody: string;
    returnToWardrobeAction: string;
  }>;
  today: TodayMessages;
}>;

const en = {
  catalog: catalogMessages.en,
  common: {
    back: 'Back',
    continue: 'Continue',
  },
  navigation: {
    today: 'Today',
    weather: 'Weather',
    wardrobe: 'Wardrobe',
    settings: 'Settings',
  },
  bootstrap: {
    loadingTitle: 'Preparing kuyara',
    loadingBody: 'Your local preferences are loading.',
    errorTitle: 'kuyara could not start',
    errorBody: 'Your local data is still safe. Close the app and try again.',
  },
  onboarding: {
    stepPosition: (position: number, total: number) => `Step ${position} of ${total}`,
    welcomeTitle: 'Welcome to kuyara',
    welcomeBody: 'A calm way to make daily clothing choices with the weather in mind.',
    promiseHeading: 'What to expect',
    weatherPromise: 'kuyara uses weather to simplify what to wear each day.',
    outfitsPromise: 'You will see three complete outfit suggestions for different plans.',
    wardrobePromise: 'When you add wardrobe pieces later, kuyara can include them in your options.',
    clothingTitle: 'Choose your clothing preference',
    clothingBody: 'This controls the catalog and recommendation style. You can change it later in Settings.',
    detailsTitle: 'Make kuyara yours',
    detailsBody: 'Confirm how kuyara should display language and appearance on this device.',
    completeAction: 'Start using kuyara',
    clothingRequiredError: 'Choose a clothing preference to continue.',
    saveError: 'Your choices could not be saved. Please try again.',
  },
  preferences: {
    clothingTitle: 'Clothing preference',
    clothingDescription: 'Controls the catalog and recommendation style, not your identity.',
    womensClothing: 'Women’s clothing',
    mensClothing: 'Men’s clothing',
    languageTitle: 'Language',
    languageDescription: 'Choose a language or follow your device setting.',
    languageSystem: 'System',
    languageTurkish: 'Türkçe',
    languageEnglish: 'English',
    themeTitle: 'Appearance',
    themeDescription: 'Choose an appearance or follow your device setting.',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
  },
  settings: {
    title: 'Settings',
    introduction: 'Changes are saved on this device as soon as you select them.',
    saving: 'Saving changes…',
    saveError: 'That change could not be saved. Your previous setting is still active.',
  },
  weather: {
    title: 'Weather',
    placeholderBody: 'Your weather details will appear here.',
  },
  wardrobe: {
    title: 'Wardrobe',
    addAction: 'Add item',
    addHint: 'Opens the new wardrobe item form.',
    emptyTitle: 'Your wardrobe is ready for its first item',
    emptyBody: 'Add the clothes you own so they are ready for future outfit choices.',
    emptyAction: 'Add your first item',
    loadingLabel: 'Loading your wardrobe.',
    loadErrorTitle: 'Your wardrobe could not be loaded',
    loadErrorBody: 'Your saved items are still safe. Please try again.',
    retryAction: 'Try again',
    itemHint: 'Opens this wardrobe item for editing.',
    unclassifiedType: 'Type not selected',
    itemAccessibilityLabel: ({ name, type, category, color }) =>
      [name, type, category, color].filter(Boolean).join('. '),
    newTitle: 'Add wardrobe item',
    editTitle: 'Edit wardrobe item',
    backAction: 'Back to wardrobe',
    nameLabel: 'Item name',
    nameDescription: 'Optional. Use a name that helps you recognize this item.',
    namePlaceholder: 'For example, everyday rain jacket',
    photoTitle: 'Photo',
    photoDescription: 'Optional. One photo is stored privately on this device.',
    photoEmptyBody: 'No photo selected.',
    selectPhotoAction: 'Select photo',
    changePhotoAction: 'Change photo',
    removePhotoAction: 'Remove photo',
    photoProcessingLabel: 'Preparing photo…',
    photoError:
      'The photo could not be prepared. Your other changes are still here; please try again.',
    photoAccessibilityLabel: (type: string) => `${type} wardrobe item photo.`,
    typeTitle: 'Clothing type',
    typeDescription: 'Required. Choose the closest type from the catalog.',
    typeRequiredError: 'Choose a clothing type before saving.',
    colorTitle: 'Color family',
    colorDescription: 'Optional. Choose the item’s main color family.',
    colorUnspecified: 'Not specified',
    attributesTitle: 'Item properties',
    attributesDescription:
      'Keep the catalog default or choose a value that better describes this item.',
    attributeDefault: (value: string) => `Catalog default: ${value}`,
    attributeLabels: {
      thermalLevelOverride: 'Insulation',
      waterProtectionOverride: 'Water protection',
      windProtectionOverride: 'Wind protection',
      breathabilityOverride: 'Breathability',
      armCoverageOverride: 'Arm coverage',
      legCoverageOverride: 'Leg coverage',
      tractionSuitabilityOverride: 'Traction',
    },
    saveAction: 'Save item',
    savingLabel: 'Saving item…',
    createError: 'This item could not be added. Your entries are still here; please try again.',
    updateError: 'This item could not be saved. Your changes are still here; please try again.',
    typeChangeTitle: 'Change clothing type?',
    typeChangeBody:
      'Changing the type will remove your item property choices and use the new type’s catalog defaults.',
    keepTypeAction: 'Keep current type',
    changeTypeAction: 'Change type and reset properties',
    discardTitle: 'Discard unsaved changes?',
    discardBody: 'Your changes to this wardrobe item will be lost.',
    keepEditingAction: 'Keep editing',
    discardAction: 'Discard changes',
    deleteSectionTitle: 'Remove from wardrobe',
    deleteSectionBody: 'This item will no longer appear in your wardrobe list.',
    deleteAction: 'Delete item',
    deletingLabel: 'Deleting item…',
    deleteConfirmTitle: 'Delete this item?',
    deleteConfirmBody: 'The item will be removed from your wardrobe list.',
    cancelDeleteAction: 'Keep item',
    confirmDeleteAction: 'Delete from wardrobe',
    deleteError: 'This item could not be deleted. Please try again.',
    notFoundTitle: 'Wardrobe item not found',
    notFoundBody: 'It may have been deleted or is no longer available.',
    returnToWardrobeAction: 'Return to wardrobe',
  },
  today: {
    title: 'Today',
    settingsAction: 'Settings',
    settingsHint: 'Opens clothing, language, and appearance settings.',
    weatherHeading: 'Weather at a glance',
    guidanceHeading: 'Your clothing strategy',
    outfitsHeading: 'Three ways to dress',
    outfitsSupportingText: 'Complete options for different plans, all suited to today.',
    piecesHeading: 'Wear',
    reasonsHeading: 'Why it works',
    locations: {
      'location.istanbul': 'İstanbul',
    },
    conditions: {
      'weather.lightRain': 'Cool with possible light rain',
    },
    strategies: {
      'strategy.lightLayersRainReady':
        'Choose light layers, and keep something rain-ready nearby.',
    },
    outfits: {
      'outfit.comfortable': {
        title: 'Comfortable',
        description: 'An easy layered option for a relaxed day.',
      },
      'outfit.polished': {
        title: 'Polished',
        description: 'Clean lines with enough coverage for changing weather.',
      },
      'outfit.rainReady': {
        title: 'Rain-ready',
        description: 'Extra protection for longer stretches outdoors.',
      },
    },
    slots: {
      'slot.top': 'Top',
      'slot.bottom': 'Bottom',
      'slot.outerLayer': 'Outer layer',
      'slot.footwear': 'Footwear',
      'slot.accessory': 'Accessory',
    },
    items: {
      'clothing.cottonShirt': 'Cotton shirt',
      'clothing.relaxedTrousers': 'Relaxed trousers',
      'clothing.lightOvershirt': 'Light overshirt',
      'clothing.waterResistantSneakers': 'Water-resistant sneakers',
      'accessory.compactUmbrella': 'Compact umbrella',
      'clothing.fineKnitTop': 'Fine-knit top',
      'clothing.tailoredTrousers': 'Tailored trousers',
      'clothing.lightTrenchCoat': 'Light trench coat',
      'clothing.waterResistantLoafers': 'Water-resistant loafers',
      'clothing.longSleeveTee': 'Long-sleeve T-shirt',
      'clothing.straightJeans': 'Straight-leg jeans',
      'clothing.hoodedRainJacket': 'Hooded rain jacket',
      'clothing.waterproofAnkleBoots': 'Waterproof ankle boots',
    },
    reasons: {
      'reason.coolMorning': 'Comfortable through the cool morning.',
      'reason.possibleRain': 'Prepared for a chance of rain.',
      'reason.temperatureDrop': 'Easy to adjust if the temperature drops.',
      'reason.moderateWind': 'Adds coverage when the breeze picks up.',
    },
    emphasis: {
      recommended: 'Recommended',
      weatherReady: 'Most weather-ready',
    },
    updatedAt: (time: string) => `Updated at ${time}`,
    staleAt: (time: string) => `Last updated at ${time} · May be out of date`,
    apparentTemperature: (temperature: string) => `Feels like ${temperature}`,
    temperatureRange: (minimum: string, maximum: string) => `Low ${minimum} · High ${maximum}`,
    rainProbability: (probability: string) => `${probability} chance of rain`,
    optionPosition: (position: number, total: number) => `Option ${position} of ${total}`,
    loadingTitle: 'Preparing today’s guidance',
    loadingBody: 'Your weather summary and outfit options will appear here.',
    loadingAccessibilityLabel: 'Preparing today’s guidance. Content is loading.',
    unavailableTitle: 'Today’s guidance is unavailable',
    unavailableBody: 'There is no saved guidance to show right now.',
    weatherAccessibilityLabel: ({
      condition,
      current,
      apparent,
      minimum,
      maximum,
      rainProbability,
    }) =>
      `${condition}. ${current} degrees Celsius, feels like ${apparent} degrees. ` +
      `Low ${minimum}, high ${maximum}. ${rainProbability} percent chance of rain.`,
    outfitAccessibilityLabel: ({
      position,
      total,
      title,
      description,
      pieces,
      reasons,
    }) =>
      `Option ${position} of ${total}: ${title}. ${description} Wear: ${pieces}. ` +
      `Why it works: ${reasons}`,
  },
} satisfies AppMessages;

const tr = {
  catalog: catalogMessages.tr,
  common: {
    back: 'Geri',
    continue: 'Devam et',
  },
  navigation: {
    today: 'Bugün',
    weather: 'Hava',
    wardrobe: 'Gardırop',
    settings: 'Ayarlar',
  },
  bootstrap: {
    loadingTitle: 'kuyara hazırlanıyor',
    loadingBody: 'Bu cihazdaki tercihleriniz yükleniyor.',
    errorTitle: 'kuyara başlatılamadı',
    errorBody: 'Yerel verileriniz güvende. Uygulamayı kapatıp yeniden deneyin.',
  },
  onboarding: {
    stepPosition: (position: number, total: number) => `${total} adımdan ${position}. adım`,
    welcomeTitle: 'kuyara’ya hoş geldiniz',
    welcomeBody: 'Hava durumunu dikkate alarak günlük giyim kararlarını sakinleştiren bir yol.',
    promiseHeading: 'Sizi neler bekliyor',
    weatherPromise: 'kuyara, her gün ne giyeceğinizi kolaylaştırmak için hava durumunu kullanır.',
    outfitsPromise: 'Farklı planlar için üç eksiksiz kombin önerisi görürsünüz.',
    wardrobePromise: 'Daha sonra gardırop parçaları eklediğinizde kuyara bunları seçeneklerinize katabilir.',
    clothingTitle: 'Giyim tercihinizi seçin',
    clothingBody: 'Bu seçim katalog ve öneri tarzını belirler. Daha sonra Ayarlar’dan değiştirebilirsiniz.',
    detailsTitle: 'kuyara’yı size uygun hâle getirin',
    detailsBody: 'kuyara’nın bu cihazda kullanacağı dili ve görünümü onaylayın.',
    completeAction: 'kuyara’yı kullanmaya başla',
    clothingRequiredError: 'Devam etmek için bir giyim tercihi seçin.',
    saveError: 'Seçimleriniz kaydedilemedi. Lütfen yeniden deneyin.',
  },
  preferences: {
    clothingTitle: 'Giyim tercihi',
    clothingDescription: 'Kimliğinizi değil, katalog ve öneri tarzını belirler.',
    womensClothing: 'Kadın giyim',
    mensClothing: 'Erkek giyim',
    languageTitle: 'Dil',
    languageDescription: 'Bir dil seçin veya cihaz ayarını izleyin.',
    languageSystem: 'Sistem',
    languageTurkish: 'Türkçe',
    languageEnglish: 'English',
    themeTitle: 'Görünüm',
    themeDescription: 'Bir görünüm seçin veya cihaz ayarını izleyin.',
    themeSystem: 'Sistem',
    themeLight: 'Açık',
    themeDark: 'Koyu',
  },
  settings: {
    title: 'Ayarlar',
    introduction: 'Yaptığınız seçimler anında bu cihaza kaydedilir.',
    saving: 'Değişiklikler kaydediliyor…',
    saveError: 'Bu değişiklik kaydedilemedi. Önceki ayarınız kullanılmaya devam ediyor.',
  },
  weather: {
    title: 'Hava',
    placeholderBody: 'Hava durumu ayrıntılarınız burada görünecek.',
  },
  wardrobe: {
    title: 'Gardırop',
    addAction: 'Parça ekle',
    addHint: 'Yeni gardırop parçası formunu açar.',
    emptyTitle: 'Gardırobunuz ilk parçaya hazır',
    emptyBody: 'Sahip olduğunuz parçaları ilerideki kombin seçimleri için ekleyin.',
    emptyAction: 'İlk parçanızı ekleyin',
    loadingLabel: 'Gardırobunuz yükleniyor.',
    loadErrorTitle: 'Gardırobunuz yüklenemedi',
    loadErrorBody: 'Kayıtlı parçalarınız güvende. Lütfen yeniden deneyin.',
    retryAction: 'Yeniden dene',
    itemHint: 'Bu gardırop parçasını düzenlemek için açar.',
    unclassifiedType: 'Tür seçilmedi',
    itemAccessibilityLabel: ({ name, type, category, color }) =>
      [name, type, category, color].filter(Boolean).join('. '),
    newTitle: 'Gardırop parçası ekle',
    editTitle: 'Gardırop parçasını düzenle',
    backAction: 'Gardıroba dön',
    nameLabel: 'Parça adı',
    nameDescription: 'İsteğe bağlı. Bu parçayı tanımanıza yardımcı olacak bir ad kullanın.',
    namePlaceholder: 'Örneğin günlük yağmurluk',
    photoTitle: 'Fotoğraf',
    photoDescription: 'İsteğe bağlı. Tek fotoğraf yalnızca bu cihazda gizli tutulur.',
    photoEmptyBody: 'Fotoğraf seçilmedi.',
    selectPhotoAction: 'Fotoğraf seç',
    changePhotoAction: 'Fotoğrafı değiştir',
    removePhotoAction: 'Fotoğrafı kaldır',
    photoProcessingLabel: 'Fotoğraf hazırlanıyor…',
    photoError:
      'Fotoğraf hazırlanamadı. Diğer değişiklikleriniz hâlâ burada; lütfen yeniden deneyin.',
    photoAccessibilityLabel: (type: string) => `${type} gardırop parçası fotoğrafı.`,
    typeTitle: 'Giyim türü',
    typeDescription: 'Zorunlu. Katalogdan en yakın türü seçin.',
    typeRequiredError: 'Kaydetmeden önce bir giyim türü seçin.',
    colorTitle: 'Renk ailesi',
    colorDescription: 'İsteğe bağlı. Parçanın ana renk ailesini seçin.',
    colorUnspecified: 'Belirtilmedi',
    attributesTitle: 'Parça özellikleri',
    attributesDescription:
      'Katalog varsayılanını kullanın veya bu parçayı daha iyi anlatan bir değer seçin.',
    attributeDefault: (value: string) => `Katalog varsayılanı: ${value}`,
    attributeLabels: {
      thermalLevelOverride: 'Yalıtım',
      waterProtectionOverride: 'Su koruması',
      windProtectionOverride: 'Rüzgâr koruması',
      breathabilityOverride: 'Nefes alabilirlik',
      armCoverageOverride: 'Kol kapatma',
      legCoverageOverride: 'Bacak kapatma',
      tractionSuitabilityOverride: 'Tutuş',
    },
    saveAction: 'Parçayı kaydet',
    savingLabel: 'Parça kaydediliyor…',
    createError: 'Bu parça eklenemedi. Girdileriniz hâlâ burada; lütfen yeniden deneyin.',
    updateError: 'Bu parça kaydedilemedi. Değişiklikleriniz hâlâ burada; lütfen yeniden deneyin.',
    typeChangeTitle: 'Giyim türü değiştirilsin mi?',
    typeChangeBody:
      'Türü değiştirmek, parça özellikleri seçimlerinizi kaldırır ve yeni türün katalog varsayılanlarını kullanır.',
    keepTypeAction: 'Mevcut türü koru',
    changeTypeAction: 'Türü değiştir ve özellikleri sıfırla',
    discardTitle: 'Kaydedilmemiş değişiklikler silinsin mi?',
    discardBody: 'Bu gardırop parçasında yaptığınız değişiklikler kaybolacak.',
    keepEditingAction: 'Düzenlemeye devam et',
    discardAction: 'Değişiklikleri sil',
    deleteSectionTitle: 'Gardıroptan kaldır',
    deleteSectionBody: 'Bu parça artık gardırop listenizde görünmeyecek.',
    deleteAction: 'Parçayı sil',
    deletingLabel: 'Parça siliniyor…',
    deleteConfirmTitle: 'Bu parça silinsin mi?',
    deleteConfirmBody: 'Parça gardırop listenizden kaldırılacak.',
    cancelDeleteAction: 'Parçayı koru',
    confirmDeleteAction: 'Gardıroptan sil',
    deleteError: 'Bu parça silinemedi. Lütfen yeniden deneyin.',
    notFoundTitle: 'Gardırop parçası bulunamadı',
    notFoundBody: 'Bu parça silinmiş veya artık kullanılamıyor olabilir.',
    returnToWardrobeAction: 'Gardıroba dön',
  },
  today: {
    title: 'Bugün',
    settingsAction: 'Ayarlar',
    settingsHint: 'Giyim, dil ve görünüm ayarlarını açar.',
    weatherHeading: 'Kısaca hava durumu',
    guidanceHeading: 'Bugünün giyim stratejisi',
    outfitsHeading: 'Üç farklı kombin',
    outfitsSupportingText: 'Farklı planlara uygun, bugün için eksiksiz seçenekler.',
    piecesHeading: 'Parçalar',
    reasonsHeading: 'Neden uygun',
    locations: {
      'location.istanbul': 'İstanbul',
    },
    conditions: {
      'weather.lightRain': 'Serin, hafif yağmur ihtimali var',
    },
    strategies: {
      'strategy.lightLayersRainReady':
        'Hafif katmanlar seçin; yağmura uygun bir parçayı yakınınızda tutun.',
    },
    outfits: {
      'outfit.comfortable': {
        title: 'Rahat',
        description: 'Sakin bir gün için kolay ve katmanlı bir seçenek.',
      },
      'outfit.polished': {
        title: 'Özenli',
        description: 'Değişen havaya uygun korumayla temiz ve düzenli bir görünüm.',
      },
      'outfit.rainReady': {
        title: 'Yağmura hazır',
        description: 'Dışarıda daha uzun kalacağınız zamanlar için ekstra koruma.',
      },
    },
    slots: {
      'slot.top': 'Üst',
      'slot.bottom': 'Alt',
      'slot.outerLayer': 'Dış katman',
      'slot.footwear': 'Ayakkabı',
      'slot.accessory': 'Aksesuar',
    },
    items: {
      'clothing.cottonShirt': 'Pamuklu gömlek',
      'clothing.relaxedTrousers': 'Rahat kesim pantolon',
      'clothing.lightOvershirt': 'Hafif gömlek ceket',
      'clothing.waterResistantSneakers': 'Suya dayanıklı spor ayakkabı',
      'accessory.compactUmbrella': 'Kompakt şemsiye',
      'clothing.fineKnitTop': 'İnce örgü üst',
      'clothing.tailoredTrousers': 'Kumaş pantolon',
      'clothing.lightTrenchCoat': 'Hafif trençkot',
      'clothing.waterResistantLoafers': 'Suya dayanıklı loafer',
      'clothing.longSleeveTee': 'Uzun kollu tişört',
      'clothing.straightJeans': 'Düz kesim jean',
      'clothing.hoodedRainJacket': 'Kapüşonlu yağmurluk',
      'clothing.waterproofAnkleBoots': 'Su geçirmez bilek botu',
    },
    reasons: {
      'reason.coolMorning': 'Serin sabah boyunca rahat tutar.',
      'reason.possibleRain': 'Yağmur ihtimaline karşı hazırlıklıdır.',
      'reason.temperatureDrop': 'Sıcaklık düşerse kolayca uyarlanabilir.',
      'reason.moderateWind': 'Rüzgâr arttığında daha fazla koruma sağlar.',
    },
    emphasis: {
      recommended: 'Önerilen',
      weatherReady: 'Havaya en hazırlıklı',
    },
    updatedAt: (time: string) => `Son güncelleme ${time}`,
    staleAt: (time: string) => `Son güncelleme ${time} · Güncelliğini yitirmiş olabilir`,
    apparentTemperature: (temperature: string) => `Hissedilen ${temperature}`,
    temperatureRange: (minimum: string, maximum: string) => `En düşük ${minimum} · En yüksek ${maximum}`,
    rainProbability: (probability: string) => `Yağmur olasılığı ${probability}`,
    optionPosition: (position: number, total: number) => `${total} seçenekten ${position}.`,
    loadingTitle: 'Bugünün önerileri hazırlanıyor',
    loadingBody: 'Hava özeti ve kombin seçenekleri burada görünecek.',
    loadingAccessibilityLabel: 'Bugünün önerileri hazırlanıyor. İçerik yükleniyor.',
    unavailableTitle: 'Bugünün önerileri kullanılamıyor',
    unavailableBody: 'Şu anda gösterilecek kayıtlı bir öneri yok.',
    weatherAccessibilityLabel: ({
      condition,
      current,
      apparent,
      minimum,
      maximum,
      rainProbability,
    }) =>
      `${condition}. Sıcaklık ${current} santigrat derece, hissedilen ${apparent} derece. ` +
      `En düşük ${minimum}, en yüksek ${maximum}. Yağmur olasılığı yüzde ${rainProbability}.`,
    outfitAccessibilityLabel: ({
      position,
      total,
      title,
      description,
      pieces,
      reasons,
    }) =>
      `${total} seçenekten ${position}. ${title}. ${description} Parçalar: ${pieces}. ` +
      `Neden uygun: ${reasons}`,
  },
} satisfies AppMessages;

export type SupportedLanguage = 'en' | 'tr';

export const messages: Readonly<Record<SupportedLanguage, AppMessages>> = Object.freeze({ en, tr });

export function resolveSupportedLanguage(locale: string | null | undefined): SupportedLanguage {
  return locale?.toLocaleLowerCase('en').startsWith('tr') ? 'tr' : 'en';
}

export function getMessages(locale: string | null | undefined): AppMessages {
  return messages[resolveSupportedLanguage(locale)];
}
