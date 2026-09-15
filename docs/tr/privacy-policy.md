---
title: kuyara gizlilik politikası
lang: tr
ref: privacy-policy
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
