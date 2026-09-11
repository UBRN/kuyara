---
title: kuyara privacy policy
---

# kuyara privacy policy

Effective date: 2026-09-11. Türkçe metin aşağıdadır.

kuyara is a weather and outfit recommendation app for iOS and Android. This policy
describes what data the app sends off your device, why, and what you can do about it.

## Summary

- kuyara has no account. Your profile, Closet and settings live on your device.
- The only data kuyara keeps about how you use the app is optional usage analytics, and
  only after you accept it on the first-launch prompt.
- Analytics never includes your location, photos, Closet contents, name, birth date, or
  anything you type.
- kuyara does not track you across other apps or websites, shows no ads, and sells no data.
- You can turn analytics off at any time in Settings under Privacy.

## Usage analytics

kuyara asks once, after onboarding, whether you want to share usage data. If you decline,
nothing is sent and the app works exactly the same. If you accept, kuyara collects:

- **Product interaction.** Which screens open, taps such as refresh, whether a
  recommendation loaded, and how the Closet is used.
- **Other usage data.** Coarse product state such as whether a recommendation came from
  AI or the built-in fallback, your dress style setting, and a coarse age range (never
  your birth date).
- **An analytics identifier.** A random identifier created on your device when analytics
  is enabled. It links your events to each other so that funnels and feature use can be
  understood. It is not the advertising identifier, is not derived from any hardware
  identifier, and is not connected to your profile, your Closet, or any account.

Because dress style and age range travel with the identifier, this data counts as linked
to you under Apple's App Store definitions. It is not used for tracking.

**Why.** To understand which parts of kuyara are used, where recommendations fail, and
what to improve. It is used for nothing else.

**Never in analytics:** your location, coordinates, or city; Closet photos or image
content; garment names or any free-form text; your birth date or birth year; your gender;
full AI prompts or responses; raw weather provider responses; any device fingerprint.

**Processor.** Analytics is processed by PostHog (PostHog, Inc.) on PostHog Cloud EU,
hosted in Frankfurt, Germany. PostHog processes this data on kuyara's behalf as a data
processor under its data processing agreement and protects it to at least the standard
described here. PostHog's project settings discard your IP address at ingestion, so no
location, not even a city, is derived from it.

**Retention.** Analytics events are kept for 12 months and then deleted by PostHog.

## Turning analytics off

Open Settings, then Privacy, and switch off "Share usage data". Collection stops
immediately. The app also discards the analytics identifier, so events collected before
that moment cannot be linked to anything collected later. Turning analytics back on
creates a new identifier.

## Requesting deletion

Analytics events are stored without a user profile. That keeps them anonymous, but it also
means the processor cannot always delete them by identifier. If you want your events
deleted:

1. Copy your analytics identifier from Settings under Privacy (it is shown while sharing
   is on).
2. Email the maintainer at the address in the Contact section below with that identifier.

kuyara will forward the request to PostHog and tell you what happened, but cannot
guarantee that events without a profile can be removed early. In every case the events
expire after 12 months.

## Weather and recommendations

To show weather and build outfits, the app talks to kuyara's own server, which in turn
calls weather and AI providers. This is a live request, not a record of you:

- **Weather.** The server receives your chosen location rounded to a hundredth of a degree
  (roughly one kilometre) and its time zone, uses them to fetch the forecast from a
  weather provider (Apple WeatherKit, Open-Meteo or OpenWeather), and returns it. Exact
  coordinates are never sent, stored, or logged. A location you choose by typing a city
  name is looked up through the same server with Open-Meteo's geocoding service.
- **Recommendations.** The server receives the deterministic clothing requirements derived
  from the weather, your clothing preference, your dress style, a day seed, and the
  identifiers of catalog outfits it may choose from, and may pass these to an AI provider
  to pick three. It never receives your location, your Closet, photos, names, birth date,
  or any identifier for you or your device.
- **On the device.** Your profile, Closet entries and photos, cached weather, and weather
  alert schedules are stored in the app's private storage on your device. Closet photos
  are not uploaded. Weather alerts are scheduled locally; no push token or device
  registration is sent anywhere.

## Accounts

kuyara currently has no account and no cross-device sync. Accounts are planned for a
later version. When they arrive, this policy will be updated before they launch, and
account deletion will cover any analytics data associated with the account.

## Changes

Changes to this policy are published at this address with a new effective date.

## Contact

Questions and deletion requests: email the maintainer at
[quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). Bug reports belong on the
[support page](support).

---

# kuyara gizlilik politikası

Yürürlük tarihi: 11 Eylül 2026.

kuyara, iOS ve Android için bir hava durumu ve kıyafet önerisi uygulamasıdır. Bu metin
uygulamanın cihazından hangi verileri gönderdiğini, neden gönderdiğini ve bu konuda ne
yapabileceğini anlatır.

## Özet

- kuyara'da hesap yok. Profilin, Gardırobun ve ayarların cihazında durur.
- kuyara'nın uygulamayı nasıl kullandığına dair tuttuğu tek veri, isteğe bağlı kullanım
  analitiğidir ve yalnızca ilk açılıştaki soruyu kabul edersen toplanır.
- Analitik hiçbir zaman konumunu, fotoğraflarını, Gardırop içeriğini, adını, doğum
  tarihini ya da yazdığın bir şeyi içermez.
- kuyara seni başka uygulamalarda veya sitelerde izlemez, reklam göstermez ve veri satmaz.
- Analitiği istediğin zaman Ayarlar'daki Gizlilik bölümünden kapatabilirsin.

## Kullanım analitiği

kuyara, tanışma adımlarından sonra bir kez kullanım verisi paylaşmak isteyip
istemediğini sorar. Reddedersen hiçbir şey gönderilmez ve uygulama aynı şekilde çalışır.
Kabul edersen kuyara şunları toplar:

- **Ürün etkileşimi.** Hangi ekranların açıldığı, yenileme gibi dokunuşlar, önerinin
  yüklenip yüklenmediği ve Gardırobun nasıl kullanıldığı.
- **Diğer kullanım verisi.** Önerinin yapay zekadan mı yoksa yerleşik yedek yöntemden mi
  geldiği gibi kaba ürün durumu, giyim tarzı ayarın ve kaba bir yaş aralığı (doğum tarihin
  asla).
- **Bir analitik kimliği.** Analitik açıldığında cihazında oluşturulan rastgele bir
  kimlik. Olayları birbirine bağlar; böylece akışlar ve özellik kullanımı anlaşılabilir.
  Reklam kimliği değildir, hiçbir donanım kimliğinden türetilmez ve profiline,
  Gardırobuna ya da herhangi bir hesaba bağlı değildir.

Giyim tarzı ve yaş aralığı bu kimlikle birlikte gittiği için, bu veri Apple'ın App Store
tanımlarına göre "kullanıcıyla ilişkili" sayılır. İzleme için kullanılmaz.

**Neden.** kuyara'nın hangi bölümlerinin kullanıldığını, önerilerin nerede başarısız
olduğunu ve neyin iyileştirileceğini anlamak için. Başka hiçbir amaçla kullanılmaz.

**Analitiğe asla girmeyenler:** konumun, koordinatların veya şehrin; Gardırop
fotoğrafları veya görsel içerik; giysi adları veya serbest metin; doğum tarihin veya doğum
yılın; cinsiyetin; yapay zeka istemlerinin veya yanıtlarının tamamı; hava durumu
sağlayıcılarının ham yanıtları; herhangi bir cihaz parmak izi.

**İşleyici.** Analitik, PostHog (PostHog, Inc.) tarafından Frankfurt, Almanya'da barındırılan
PostHog Cloud EU üzerinde işlenir. PostHog bu veriyi kuyara adına, veri işleme
sözleşmesi kapsamında bir veri işleyici olarak işler ve burada anlatılan düzeyde korur.
PostHog proje ayarları IP adresini alım anında siler; dolayısıyla IP'den şehir bile
olsa bir konum türetilmez.

**Saklama.** Analitik olayları 12 ay saklanır, sonra PostHog tarafından silinir.

## Analitiği kapatmak

Ayarlar'ı, ardından Gizlilik'i aç ve "Kullanım verisi paylaş" seçeneğini kapat. Toplama
hemen durur. Uygulama analitik kimliğini de siler; böylece o ana kadar toplanan olaylar
sonrasında toplananlarla ilişkilendirilemez. Analitiği yeniden açmak yeni bir kimlik
oluşturur.

## Silme talebi

Analitik olayları bir kullanıcı profili olmadan saklanır. Bu onları anonim tutar, ama
işleyicinin onları her zaman kimlikle silemeyeceği anlamına da gelir. Olaylarının
silinmesini istersen:

1. Ayarlar'daki Gizlilik bölümünden analitik kimliğini kopyala (paylaşım açıkken
   görünür).
2. Aşağıdaki İletişim bölümündeki adrese bu kimlikle birlikte e-posta gönder.

kuyara talebi PostHog'a iletir ve sonucu sana bildirir; ancak profilsiz olayların erken
silinebileceğini garanti edemez. Her durumda olaylar 12 ay sonra silinir.

## Hava durumu ve öneriler

Hava durumunu göstermek ve kombin oluşturmak için uygulama kuyara'nın kendi sunucusuyla
konuşur; sunucu da hava durumu ve yapay zeka sağlayıcılarını çağırır. Bu anlık bir
istektir, senin hakkında tutulan bir kayıt değildir:

- **Hava durumu.** Sunucu, seçtiğin konumu derecenin yüzde birine yuvarlanmış olarak
  (yaklaşık bir kilometre) ve saat dilimiyle birlikte alır, bununla tahmini bir hava
  durumu sağlayıcısından (Apple WeatherKit, Open-Meteo veya OpenWeather) çeker ve geri
  döndürür. Kesin koordinatlar hiçbir zaman gönderilmez, saklanmaz veya loglanmaz.
  Şehir adı yazarak seçtiğin bir konum aynı sunucu üzerinden Open-Meteo'nun coğrafi
  kodlama hizmetiyle aranır.
- **Öneriler.** Sunucu, hava durumundan türetilen deterministik giyim gereksinimlerini,
  giyim tercihini, giyim tarzını, bir gün tohumunu ve seçebileceği katalog kombinlerinin
  kimliklerini alır; üçünü seçmesi için bunları bir yapay zeka sağlayıcısına iletebilir.
  Konumunu, Gardırobunu, fotoğraflarını, adlarını, doğum tarihini ya da sana veya
  cihazına ait herhangi bir kimliği hiçbir zaman almaz.
- **Cihazda.** Profilin, Gardırop kayıtların ve fotoğrafların, önbelleğe alınmış hava
  durumu ve hava uyarısı planları uygulamanın cihazındaki özel alanında saklanır.
  Gardırop fotoğrafları yüklenmez. Hava uyarıları cihazda planlanır; hiçbir yere push
  jetonu veya cihaz kaydı gönderilmez.

## Hesaplar

kuyara'da şu anda hesap ve cihazlar arası eşitleme yok. Hesaplar ileriki bir sürüm için
planlanıyor. Geldiklerinde bu politika onlar yayınlanmadan önce güncellenecek ve hesap
silme, hesapla ilişkili analitik verisini de kapsayacak.

## Değişiklikler

Bu politikadaki değişiklikler yeni bir yürürlük tarihiyle bu adreste yayınlanır.

## İletişim

Sorular ve silme talepleri için sorumluya e-posta gönder:
[quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). Hata bildirimleri için
[destek sayfasına](support) bak.
