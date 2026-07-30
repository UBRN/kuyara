export type AppMessages = {
  tabs: {
    home: string;
    explore: string;
  };
  home: {
    title: string;
    start: string;
    tryEditing: string;
    devTools: string;
    freshStart: string;
    browserDevTools: string;
    deviceDevMenu: string;
    simulatorDevMenu: (shortcut: string) => string;
  };
  explore: {
    title: string;
    introduction: string;
    documentation: string;
    routingTitle: string;
    routingBody: string;
    platformTitle: string;
    platformBody: string;
    imagesTitle: string;
    imagesBody: string;
    themeTitle: string;
    themeBody: string;
    animationsTitle: string;
    animationsBody: string;
    learnMore: string;
    expandSection: (title: string) => string;
    collapseSection: (title: string) => string;
  };
  web: {
    starter: string;
    docs: string;
  };
};

const en = {
  tabs: {
    home: 'Home',
    explore: 'Explore',
  },
  home: {
    title: 'Welcome to kuyara',
    start: 'get started',
    tryEditing: 'Try editing',
    devTools: 'Dev tools',
    freshStart: 'Fresh start',
    browserDevTools: 'Use browser developer tools',
    deviceDevMenu: 'Shake the device or press m in the terminal',
    simulatorDevMenu: (shortcut: string) => `Press ${shortcut} to open the developer menu`,
  },
  explore: {
    title: 'Explore',
    introduction: 'This starter screen demonstrates the current application shell.',
    documentation: 'Expo documentation',
    routingTitle: 'File-based routing',
    routingBody: 'The index and explore routes are connected by the root tab layout.',
    platformTitle: 'Android, iOS, and web support',
    platformBody: 'The shared application remains compatible with Android, iOS, and the web.',
    imagesTitle: 'Images',
    imagesBody: 'Static images can provide density-specific variants for crisp rendering.',
    themeTitle: 'Light and dark appearance',
    themeBody: 'The application follows the device appearance by default.',
    animationsTitle: 'Motion',
    animationsBody: 'Interface motion respects the system Reduce Motion preference.',
    learnMore: 'Learn more',
    expandSection: (title: string) => `Expand ${title}`,
    collapseSection: (title: string) => `Collapse ${title}`,
  },
  web: {
    starter: 'kuyara starter',
    docs: 'Docs',
  },
} satisfies AppMessages;

const tr = {
  tabs: {
    home: 'Ana Sayfa',
    explore: 'Keşfet',
  },
  home: {
    title: 'kuyara’ya hoş geldiniz',
    start: 'başlayın',
    tryEditing: 'Düzenlemeyi deneyin',
    devTools: 'Geliştirici araçları',
    freshStart: 'Yeni başlangıç',
    browserDevTools: 'Tarayıcı geliştirici araçlarını kullanın',
    deviceDevMenu: 'Aygıtı sallayın veya terminalde m tuşuna basın',
    simulatorDevMenu: (shortcut: string) =>
      `Geliştirici menüsünü açmak için ${shortcut} tuşlarına basın`,
  },
  explore: {
    title: 'Keşfet',
    introduction: 'Bu başlangıç ekranı mevcut uygulama kabuğunu gösterir.',
    documentation: 'Expo belgeleri',
    routingTitle: 'Dosya tabanlı yönlendirme',
    routingBody: 'Ana sayfa ve keşfet rotaları kök sekme düzeniyle birbirine bağlanır.',
    platformTitle: 'Android, iOS ve web desteği',
    platformBody: 'Paylaşılan uygulama Android, iOS ve web ile uyumlu kalır.',
    imagesTitle: 'Görseller',
    imagesBody: 'Statik görseller net görüntü için yoğunluğa özel çeşitler sağlayabilir.',
    themeTitle: 'Açık ve koyu görünüm',
    themeBody: 'Uygulama varsayılan olarak aygıt görünümünü izler.',
    animationsTitle: 'Hareket',
    animationsBody: 'Arayüz hareketleri sistemdeki Hareketi Azalt tercihine uyar.',
    learnMore: 'Daha fazla bilgi',
    expandSection: (title: string) => `${title} bölümünü genişlet`,
    collapseSection: (title: string) => `${title} bölümünü daralt`,
  },
  web: {
    starter: 'kuyara başlangıcı',
    docs: 'Belgeler',
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
