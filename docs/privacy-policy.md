---
title: kuyara privacy policy
---

# kuyara privacy policy

Effective date: 2026-09-13. Türkçe metin aşağıdadır.

kuyara is a weather and outfit recommendation app for iOS and Android. This policy
describes what data the app sends off your device, why, and what you can do about it.

## Summary

- kuyara does not ask you to sign in. Your profile, Closet and settings live on your device.
- The only data kuyara keeps about how you use the app is optional usage analytics and
  diagnostics, sent only after you accept the consent question kuyara asks after onboarding.
- Analytics never includes your location, photos, Closet contents, name, birth date, or
  anything you type.
- kuyara does not track you across other apps or websites, shows no ads, and sells no data.
- You can turn analytics and diagnostics off at any time in Settings under Privacy.

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

## Performance and diagnostics

Performance and diagnostic data follows the same consent question kuyara asks after
onboarding for usage analytics. It is sent only if you accept. If you decline, nothing is
sent. If you accept, kuyara sends:

- **Performance timings.** App launch and screen-navigation timing, including time to first
  render and time to interactive.
- **App-defined events.** That a recommendation was generated or weather was refreshed.
  These events contain only closed category values and durations in whole milliseconds.
- **Handled errors.** Errors kuyara reports itself contain a short error code, coarse
  attributes and a stack trace of the app's own code, never the original error's message.
- **Crashes and unhandled errors.** If the app crashes or hits an error it did not handle,
  the report includes the technical error type, its message and a stack trace, plus the
  crash diagnostics iOS provides. These describe the app's code, not you. They can still
  contain technical text the app was processing at that moment. iOS hands crash
  diagnostics to the app after a later launch, and they are sent with the next dispatch
  while sharing is on. Unhandled JavaScript error reports and their stack traces also go
  to kuyara's analytics provider, PostHog, in the EU under the same consent answer.
- **Network performance.** The host name of the slowest network request during the app
  launch window.
- **Technical details.** A random per-installation identifier created by the Expo package,
  the OS name and version, generic device model name and model identifier (not the name you
  gave your device), language, app identifier, version, build number, runtime version, and
  update and channel identifiers. The package attaches these details to every payload. The
  per-installation identifier is separate from the analytics identifier. The two are never
  joined to each other or to your profile.

**Why.** To find slow launches, failures and crashes and fix them. Nothing else.

**Processor.** Expo receives this data at its Observe endpoint over HTTPS.
Expo has not published a retention period for this data. This policy will be updated
when the period is confirmed.

**Never in performance and diagnostics:** your location, coordinates, or city; Closet
contents or photos; profile preferences; AI prompts or responses; the analytics identifier
or the app's local profile identifier.

One technical limit applies. The Expo package may automatically write technical error
records before you answer the consent question. If you accept without sending the app to
the background in between, those records may then be delivered. Nothing is sent while your
answer is "no".

Under Apple's App Store definitions, this data is linked to you through the per-installation
identifier. It is not used for tracking.

## Turning analytics and diagnostics off

Open Settings, then Privacy, and switch off "Share usage data". Sending stops
immediately for both in the same session. Records made before the switch are not sent
afterwards. The Expo package may keep writing error records locally, but none are sent while
sharing is off. The app also discards the analytics identifier, so events collected before
that moment cannot be linked to anything collected later. The diagnostics identifier stays on
your device, but nothing further is sent with it. Turning sharing back on creates a new
analytics identifier.

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

Diagnostics data carries a separate identifier that the app does not show, so kuyara cannot
currently request deletion of it by identifier. This section will be updated when Expo's
procedure is confirmed.

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

kuyara does not offer sign-in or cross-device sync today. Accounts are planned for a
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

Yürürlük tarihi: 13 Eylül 2026.

kuyara, iOS ve Android için bir hava durumu ve kıyafet önerisi uygulamasıdır. Bu metin
uygulamanın cihazından hangi verileri gönderdiğini, neden gönderdiğini ve bu konuda ne
yapabileceğini anlatır.

## Özet

- kuyara senden oturum açmanı istemiyor. Profilin, Gardırobun ve ayarların cihazında durur.
- kuyara'nın uygulamayı nasıl kullandığına dair tuttuğu tek veri, isteğe bağlı kullanım
  analitiği ve tanılama verisidir. Yalnızca tanışma adımlarından sonra sorulan onay sorusunu
  kabul edersen gönderilir.
- Analitik hiçbir zaman konumunu, fotoğraflarını, Gardırop içeriğini, adını, doğum
  tarihini ya da yazdığın bir şeyi içermez.
- kuyara seni başka uygulamalarda veya sitelerde izlemez, reklam göstermez ve veri satmaz.
- Analitiği ve tanılamayı istediğin zaman Ayarlar'daki Gizlilik bölümünden kapatabilirsin.

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

## Performans ve tanılama

Performans ve tanılama verisi, kuyara'nın tanışma adımlarından sonra kullanım analitiği için
sorduğu aynı onay sorusuna bağlıdır. Yalnızca kabul edersen gönderilir. Reddedersen hiçbir
şey gönderilmez. Kabul edersen kuyara şunları gönderir:

- **Performans süreleri.** Uygulamanın açılış ve ekranlar arası geçiş süreleri, ilk
  görüntülemeye ve etkileşime hazır hale gelmeye kadar geçen süreler dahil.
- **Uygulama tarafından tanımlanan olaylar.** Bir önerinin oluşturulması veya hava
  durumunun yenilenmesi. Bu olaylar yalnızca kapalı kategori değerlerini ve tam sayı milisaniye
  cinsinden süreleri içerir.
- **Ele alınmış hatalar.** kuyara'nın kendisinin bildirdiği hatalar kısa bir hata kodu, kaba
  nitelikler ve uygulamanın kendi kodunun yığın izini içerir. Asıl hatanın mesajı hiçbir
  zaman gönderilmez.
- **Çökmeler ve ele alınmamış hatalar.** Uygulama çökerse veya ele almadığı bir hatayla
  karşılaşırsa rapor, teknik hata türünü, mesajını, yığın izini ve iOS'in sağladığı çökme
  tanılama verilerini içerir. Bunlar seni değil, uygulamanın kodunu anlatır. Yine de
  uygulamanın o anda işlediği teknik metni içerebilir. iOS çökme tanılama verilerini
  uygulamaya sonraki bir açılışta verir; paylaşım açıkken bir sonraki gönderimle iletilir.
- **Ağ performansı.** Uygulamanın açılış aralığındaki en yavaş ağ isteğinin gittiği
  sunucunun adı.
- **Teknik bilgiler.** Expo paketinin oluşturduğu rastgele kurulum kimliği, işletim
  sisteminin adı ve sürümü, genel cihaz model adı ve model kimliği (cihazına verdiğin ad
  değil), dil, uygulama kimliği, sürüm, derleme numarası, çalışma zamanı sürümü, güncelleme
  ve kanal kimlikleri. Paket bu bilgileri gönderilen her veriye ekler. Kurulum kimliği
  analitik kimliğinden ayrıdır. Bu iki kimlik birbiriyle veya profilinle asla birleştirilmez.

**Neden.** Yavaş açılışları, hataları ve çökmeleri bulup düzeltmek için. Başka hiçbir amaçla kullanılmaz.

**İşleyici.** Expo, bu veriyi HTTPS üzerinden Observe uç noktasında alır.
Expo bu veri için bir saklama süresi yayınlamamıştır. Süre kesinleştiğinde
bu politika güncellenecektir.

**Performans ve tanılamaya asla girmeyenler:** konumun, koordinatların veya şehrin;
Gardırop içeriği veya fotoğrafları; profil tercihlerin; yapay zeka istemleri veya yanıtları;
analitik kimliği veya uygulamanın yerel profil kimliği.

Bir teknik sınır vardır. Expo paketi, onay sorusunu yanıtlamadan önce teknik hata kayıtlarını
otomatik olarak yazabilir. Arada uygulamayı arka plana göndermeden kabul edersen bu kayıtlar
daha sonra gönderilebilir. Yanıtın "hayır" olduğu sürece hiçbir şey gönderilmez.

Apple'ın App Store tanımlarına göre bu veri, kurulum kimliği üzerinden "kullanıcıyla
ilişkili" sayılır. İzleme için kullanılmaz.

## Analitiği ve tanılamayı kapatmak

Ayarlar'ı, ardından Gizlilik'i aç ve "Kullanım verisi paylaş" seçeneğini kapat. Gönderim
ikisi için de aynı oturumda hemen durur. Anahtarı kapatmadan önce oluşturulan kayıtlar daha
sonra gönderilmez. Expo paketi hata kayıtlarını cihazında yazmaya devam edebilir, ancak
paylaşım kapalıyken hiçbiri gönderilmez. Uygulama analitik kimliğini de siler; böylece o ana
kadar toplanan olaylar sonrasında toplananlarla ilişkilendirilemez. Tanılama kimliği
cihazında kalır, ancak onunla
başka hiçbir şey gönderilmez. Paylaşımı yeniden açmak yeni bir analitik kimliği oluşturur.

## Silme talebi

Analitik olayları bir kullanıcı profili olmadan saklanır. Bu onları anonim tutar, ama
işleyicinin onları her zaman kimlikle silemeyeceği anlamına da gelir. Olaylarının
silinmesini istersen:

1. Ayarlar'daki Gizlilik bölümünden analitik kimliğini kopyala (paylaşım açıkken
   görünür).
2. Aşağıdaki İletişim bölümündeki adrese bu kimlikle birlikte e-posta gönder.

kuyara talebi PostHog'a iletir ve sonucu sana bildirir; ancak profilsiz olayların erken
silinebileceğini garanti edemez. Her durumda olaylar 12 ay sonra silinir.

Tanılama verisi, uygulamanın göstermediği ayrı bir kimlik taşır. Bu yüzden kuyara şu anda
bu verinin kimlikle silinmesini talep edemez. Expo'nun yöntemi kesinleştiğinde bu bölüm
güncellenecektir.

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

kuyara'da şu anda oturum açma ve cihazlar arası eşitleme bulunmuyor. Hesaplar ileriki bir
sürüm için planlanıyor. Geldiklerinde bu politika onlar yayınlanmadan önce güncellenecek
ve hesap silme, hesapla ilişkili analitik verisini de kapsayacak.

## Değişiklikler

Bu politikadaki değişiklikler yeni bir yürürlük tarihiyle bu adreste yayınlanır.

## İletişim

Sorular ve silme talepleri için sorumluya e-posta gönder:
[quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). Hata bildirimleri için
[destek sayfasına](support) bak.
