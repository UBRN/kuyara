---
title: kuyara gizlilik politikası
lang: tr
ref: privacy-policy
---

# kuyara gizlilik politikası

Yürürlük tarihi: 8 Ekim 2026.

kuyara, iOS ve Android için bir hava durumu ve kıyafet önerisi uygulamasıdır. Bu metin
uygulamanın cihazından hangi verileri gönderdiğini, neden gönderdiğini ve bu konuda ne
yapabileceğini anlatır. Bu metin, KVKK md. 10 ve GDPR md. 13 uyarınca bir aydınlatma
metnidir.

## Özet

- kuyara'yı hesapsız kullanabilirsin; hesap isteğe bağlıdır. Hesap açmazsan profilin,
  Gardırobun ve ayarların cihazında durur. Hesap açarsan neyin hesaba gittiğini
  [Hesaplar](#hesaplar) bölümü anlatır.
- Kullanım analitiği ve performans tanılamaları uygulamada yaptığın seçime bağlıdır;
  aşağıda anlatılan nadir teknik kayıtlar bunun istisnasıdır.
- kuyara'nın geliştirildiği araç seti olan Expo'nun yaptığı iki istek, bu yanıttan önce ve
  yanıttan bağımsız olarak her açılışta gerçekleşir. Bu istekler rastgele bir kurulum kimliği
  ile uygulamaya ve cihaza dair sürüm bilgileri taşır. Güncelleme isteği, önceki açılışın
  ölümcül hata metnini de taşıyabilir; ayrıntılar aşağıdadır.
- Analitik hiçbir zaman konumunu, fotoğraflarını, adını, giysi adlarını, doğum
  tarihini ya da yazdığın bir şeyi içermez.
- kuyara seni başka uygulamalarda veya sitelerde izlemez, reklam göstermez ve veri satmaz.
- Analitiği ve tanılamayı istediğin zaman Ayarlar'daki Gizlilik bölümünden kapatabilirsin.

## Kullanım analitiği

kuyara, tanışma adımlarından sonra bir kez kullanım, performans ve tanılama verisi
paylaşmak isteyip istemediğini sorar. Reddedersen aşağıda anlatılan nadir teknik durumlar
dışında bu veriler gönderilmez ve uygulama aynı şekilde çalışır. Ayrı Expo açılış istekleri devam eder.
Kabul edersen kuyara şunları toplar:

- **Ürün etkileşimi.** Hangi ekranların açıldığı, yenileme gibi dokunuşlar, önerinin
  yüklenip yüklenmediği, bir öneriyi beğenip beğenmediğin, hangi kombini giydiğin, bir
  kombinde hangi parçayı değiştirdiğin, Gardırobun nasıl kullanıldığı ve bir hesapla giriş
  yapmanın, eşitlemenin ya da hesabı silmenin işe yarayıp yaramadığı (kim olduğun asla).
- **Diğer kullanım verisi.** Önerinin yapay zekadan mı yoksa yerleşik yedek yöntemden mi
  geldiği gibi kaba ürün durumu, giyim stili ayarın, bir günün ya da giydiğin kombinin
  resmiyet düzeyi ve kaba bir yaş aralığı (doğum tarihin asla).
- **Bir analitik kimliği.** Analitik açıldığında cihazında oluşturulan rastgele bir
  kimlik. Olayları birbirine bağlar; böylece akışlar ve özellik kullanımı anlaşılabilir.
  Reklam kimliği değildir, hiçbir donanım kimliğinden türetilmez ve profiline,
  Gardırobuna ya da herhangi bir hesaba bağlı değildir.

Giyim stili ve yaş aralığı bu kimlikle birlikte gittiği için, bu veri Apple'ın App Store
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
sorduğu aynı onay sorusuna bağlıdır. Normalde yalnızca kabul edersen gönderilir. Reddedersen
yanıtından sonra, aşağıda anlatılan nadir teknik durumlar dışında yeni veri gönderilmez.
Kabul edersen kuyara şunları gönderir:

- **Performans süreleri.** Uygulamanın açılış ve ekranlar arası geçiş süreleri, ilk
  görüntülemeye ve etkileşime hazır hale gelmeye kadar geçen süreler dahil.
- **Uygulama tarafından tanımlanan olaylar.** Bir önerinin oluşturulması, uygulama
  açıldıktan sonra ilk önerinin gösterilmesi veya hava durumunun yenilenmesi. Bu olaylar yalnızca kapalı kategori değerlerini ve tam sayı milisaniye
  cinsinden süreleri içerir.
- **Ele alınmış hatalar.** kuyara'nın kendisinin bildirdiği hatalar kısa bir hata kodu, kaba
  nitelikler ve uygulamanın kendi kodunun yığın izini içerir. Asıl hatanın mesajı hiçbir
  zaman gönderilmez.
- **Çökmeler ve ele alınmamış hatalar.** Uygulama çökerse veya ele almadığı bir hatayla
  karşılaşırsa rapor, teknik hata türünü, mesajını, yığın izini ve iOS'in sağladığı çökme
  tanılama verilerini içerir. Bunlar seni değil, uygulamanın kodunu anlatır. Yine de
  uygulamanın o anda işlediği teknik metni içerebilir. iOS çökme tanılama verilerini
  uygulamaya sonraki bir açılışta verir; paylaşım açıkken bir sonraki gönderimle iletilir.
  Ele alınmamış JavaScript hatalarının raporları ve yığın izleri, aynı onay yanıtı kapsamında
  kuyara'nın analitik sağlayıcısı PostHog'a da, AB bölgesine gider.
- **Ağ performansı.** Uygulamanın açılış aralığındaki en yavaş ağ isteğinin gittiği
  sunucunun adı.
- **Teknik bilgiler.** Expo paketinin oluşturduğu rastgele kurulum kimliği, işletim
  sisteminin adı ve sürümü, genel cihaz model adı ve model kimliği (cihazına verdiğin ad
  değil), dil, uygulama kimliği, sürüm, derleme numarası, çalışma zamanı sürümü, güncelleme
  ve kanal kimlikleri. Paket bu bilgileri gönderilen her veriye ekler. Kurulum kimliği
  analitik kimliğinden ayrıdır. Bu iki kimlik birbiriyle veya profilinle asla birleştirilmez.

**Neden.** Yavaş açılışları, hataları ve çökmeleri bulup düzeltmek için. Başka hiçbir amaçla kullanılmaz.

**İşleyici.** Expo, bu veriyi HTTPS üzerinden Observe uç noktasında alır.
[Expo'nun yayımladığı fiyatlandırma bilgilerine göre](https://expo.dev/pricing),
Observe bu verileri 90 gün saklar.

**Performans ve tanılamaya asla girmeyenler:** konumun, koordinatların veya şehrin;
Gardırop içeriği veya fotoğrafları; adın veya yazdığın herhangi bir şey; profil tercihlerin;
yapay zeka istemleri veya yanıtları; analitik kimliği veya uygulamanın yerel profil kimliği.

Bir teknik sınır vardır. Expo paketi, onay sorusunu yanıtlamadan önce teknik hata kayıtlarını
otomatik olarak yazabilir. Kabul ettiğinde kuyara önce pakete o ana kadar yazılmış bütün
kayıtları atlamasını söyler, bu yüzden bu kayıtlar normalde gönderilmez. Nadir durumlarda
yanıtından önceki bir kayıt yine de gönderilebilir: daha önceki bir açılışa ait ve iOS'un
uygulamaya ancak sen kabul ettikten sonra ilettiği bir çökme raporu; paylaşım kapalıyken
yazılmış bir kayıt, paylaşımı yeniden açmandan kısa süre önce bir gönderim denemesi başarısız
olduysa; ve kurulumdan sonraki ilk açılışta, uygulama kuyara başlamadan arka plana
gönderilirse açılış süresi. "Hayır" yanıtından sonra paylaşım kapalıyken Observe yeni
kayıt göndermez; aşağıdaki ayrı Expo açılış istekleri yine de çalışır.

Apple'ın App Store tanımlarına göre bu veri, kurulum kimliği üzerinden "kullanıcıyla
ilişkili" sayılır. İzleme için kullanılmaz.

## Expo açılış istekleri

kuyara Expo ile geliştirildi ve Expo'nun kendi paketlerinden ikisi uygulama her
başladığında bir istek gönderiyor. Bu istekler, onay yanıtın okunabilmesinden önce
uygulamanın yerel kodunda çalışır. Bu nedenle ikisi de Ayarlar'daki Gizlilik anahtarının
kapsamına girmez. Açılış sayımı uygulama içinden kapatılamaz. Güncelleme kontrolü ise
kuyara'nın güncellemeleri iletme yolu olduğu için açık tutuluyor.

- **Açılış sayımı.** Uygulama her sıfırdan başlatıldığında Expo Insights'a,
  `https://i.expo.dev` adresine bir istek. Bir kurulum kimliği, kuyara'nın Expo proje
  kimliği, uygulama sürümü, platform ve işletim sistemi sürümü taşır.
- **Güncelleme kontrolü.** Her açılışta Expo Updates'e, `https://u.expo.dev` adresine,
  uygulamanın daha yeni bir sürümü olup olmadığını soran bir istek. Aynı kurulum kimliğini
  bir istek başlığında, platform ve uygulamanın çalışma zamanı sürümüyle birlikte taşır.
  Önceki açılışta uygulama ele alamadığı bir şekilde çöktüyse, güncelleme kontrolü o çökmenin
  teknik hata metnini de taşır. Bu metin uygulamanın kodunu anlatır, ancak uygulamanın o anda
  işlediği teknik metni içerebilir.

Kurulum kimliği, yukarıdaki Performans ve tanılama bölümünde anlatılan rastgele kurulum
değerinin aynısıdır.

**Bu isteklere asla girmeyenler:** konumun, koordinatların veya şehrin; Gardırop içeriği
veya fotoğrafları; profil tercihlerin; adın, doğum tarihin veya cinsiyetin; yazdığın hiçbir
şey; analitik kimliği; uygulamanın yerel profil kimliği.

**Neden.** Yayınlanan her sürüm için kurulum ve açılış sayılarını görmek ve uygulama
güncellemelerini iletmek için.

**İşleyici.** Expo her iki isteği de HTTPS üzerinden alır. Expo bu veri için bir saklama
süresi yayınlamamıştır. Süre kesinleştiğinde bu politika güncellenecektir.

kuyara'yı cihazından silmek kurulum kimliğini de siler; yeni bir kurulum yeni bir kimlik
oluşturur; ancak bir cihaz yedeği geri yüklenirse eski kimlik geri gelebilir.

## Analitiği ve tanılamayı kapatmak

Ayarlar'ı, ardından Gizlilik'i aç ve "Kullanım ve tanılama verisi paylaş" seçeneğini kapat.
O anda uygulama gönderilmeyi bekleyen kayıtları, paylaşımın kapatıldığını bildiren bir
notla birlikte son bir kez gönderir; ardından ne kullanım analitiği ne de performans ve
tanılama kaydı gönderir, hâlâ kuyrukta kalan kayıtlar atılır. Expo paketi hata kayıtlarını cihazında yazmaya devam
edebilir, ancak paylaşım kapalıyken Observe'a gönderilmez; paylaşımı yeniden açarsan
yukarıdaki nadir gönderim sınırları geçerlidir. Uygulama analitik kimliğini de kullanmayı
bırakır; böylece o ana kadar toplanan olaylar sonrasında toplananlarla ilişkilendirilemez.
Paylaşımı yeniden açmak yeni bir analitik
kimliği oluşturur. Silinmesini yine de isteyebilmen için uygulamanın güncel sürümü eski
kimliği telefonunda ve yedeklerinde tutar, sen kaldırana ya da paylaşımı yeniden açana kadar
Gizlilik bölümünde gösterir; sürümün onu orada göstermiyorsa kimlik silinmiştir. kuyara onu
hiçbir yere göndermez. Tanılama kimliği cihazında kalır ve yukarıda anlatılan ayrı Expo
Insights açılış sayımı ile Expo Updates güncelleme kontrolüne eşlik etmeye devam eder.
Bu istekler anahtarın kapsamında değildir ve her durumda sürer.

## Silme talebi

Hesabını ve içindeki her şeyi silmek için Ayarlar > Hesap'ı kullan; silmenin neyi kapsadığını
[Hesaplar](#hesaplar) bölümü anlatır. kuyara'yı telefonundan silmek hesabını silmez.

Analitik olayları bir kullanıcı profili olmadan saklanır. Bu onları anonim tutar, ama
işleyicinin onları her zaman kimlikle silemeyeceği anlamına da gelir. Olaylarının
silinmesini istersen:

1. Ayarlar'daki Gizlilik bölümünden analitik kimliğini kopyala (paylaşım açıkken ve,
   uygulamanın güncel sürümünde, paylaşımı kapattıktan sonra sen kaldırana ya da paylaşımı
   yeniden açana kadar görünür).
2. Aşağıdaki İletişim bölümündeki adrese bu kimlikle birlikte e-posta gönder.

kuyara talebi PostHog'a iletir ve sonucu sana bildirir; ancak profilsiz olayların erken
silinebileceğini garanti edemez. Her durumda olaylar 12 ay sonra silinir.

Tanılama verisi ve iki Expo açılış isteği, uygulamanın göstermediği ayrı bir kimlik taşır.
Bu yüzden kuyara şu anda bu verinin kimlikle silinmesini talep edemez. Expo'nun yöntemi kesinleştiğinde bu bölüm
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
- **Öneriler.** Sunucu giyim tercihini, giyim stilini, seçtiysen stil özelliklerini,
  uygulama dilini, katalog sürümünü, gün varyantını, gün türünü, hava durumundan türetilen
  deterministik giyim gereksinimlerini ve kimlikleri, resmiyet düzeyleri, giysi türleri ve
  özellikleriyle birlikte katalog kombin seçeneklerini alır. Üç kombin seçmesi için bir
  yapay zeka sağlayıcısına yalnızca giyim tercihini, giyim stilinden türetilen resmiyet
  sırasını, gün türünü ve seçeneklerin kimliklerini, resmiyet düzeylerini, giysi türlerini
  ve uygun kombin kategorilerini iletebilir. Sağlayıcıya ayrıca yanıtı uygulama dilinde
  yazması söylenir. Stil özellikleri cihazında seçeneklerin sırasını etkiler, ancak yapay
  zeka sağlayıcısına gönderilmez. Sunucu bu istekte konumunu, Gardırop içeriğini, giyilen
  kombin geçmişini, fotoğraflarını, görünen adını, doğum tarihini veya cihazına ait bir
  kimliği almaz. Oturum açmışsan "Stiliste tekrar sor" isteği, günlük üye hakkını
  sayabilmesi için hesabının oturum anahtarını da taşır. Oturum anahtarı hesabının e-posta
  adresini ve Google ile girdiysen Google'ın gönderdiği adı ve fotoğrafı da içerir. Sunucu
  bundan yalnız hesap kimliğini, bu sayım için okur ve hiçbirini loglamaz; hiçbiri yapay zeka
  sağlayıcısına gitmez.
- **Cihazda.** Profilin (varsa görünen adın dahil), Gardırop kayıtların ve fotoğrafların,
  giyilen kombin geçmişin, günlük resmiyet düzeyi ve stil özelliği seçimlerin, Sonra için
  planladığın çıkış saatleri, önbelleğe alınmış hava durumu ve hava uyarısı planları
  uygulamanın cihazındaki özel alanında saklanır. Gardırop ve kombin geçmişi fotoğrafları
  yüklenmez. Hava uyarıları cihazda planlanır; hiçbir yere push jetonu veya cihaz kaydı
  gönderilmez. Cihazdaki bu veriler, yani uygulamanın yerel veritabanı ve varsa
  fotoğrafların, kendi yedekleme
  ayarlarına göre cihaz yedeğine (örneğin iCloud yedeğine) dahil olur; o yedek sana aittir
  ve sorumluya hiçbir zaman ulaşmaz. Gardırop kayıtlarını uygulamada silebilir, Sonra
  planını temizleyebilirsin. Mevcut Geçmiş ekranında silme seçeneği yoktur. kuyara'yı
  silmek uygulamanın cihazdaki yerel verilerini kaldırır; cihaz yedeklerindeki kopyalar
  yedekleme ayarlarına tabi olmaya devam eder. Hesap açarsan bu kayıtların bir kısmının
  kopyası hesabına da gider; [Hesaplar](#hesaplar) bölümüne bak. Fotoğraflar hesaba gitmez.

## Hesaplar

kuyara'da hesap isteğe bağlıdır. Hesap açmazsan bu bölüm seni ilgilendirmez. Bu bölüm 6698
sayılı Kişisel Verilerin Korunması Kanunu'nun (KVKK) 10. maddesi ve Avrupa Birliği Genel Veri
Koruma Tüzüğü'nün (GDPR) 13. maddesi uyarınca bir aydınlatmadır. Onay vermen gerekmez.

**Veri sorumlusu.** ubrn (Utku Barın), Türkiye'de yaşayan bireysel geliştirici. E-posta:
[quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). Yazılı başvurular için posta
adresini e-postayla istediğinde paylaşırız.

**Hangi veriler.**

- **Hesap bilgileri.** Apple ya da Google'ın verdiği e-posta adresin ve kullanıcı kimliğin,
  kuyara hesap kimliğin, hesabın açılma ve son oturum açma zamanı. Apple ile "E-postamı
  Gizle"yi seçtiysen kuyara yalnız Apple'ın yönlendirme adresini görür. Apple'dan adın
  istenmez. Google ile oturum açarsan Google adını ve profil fotoğrafını da gönderir. Hesap
  hizmeti bunları oturum kaydının bir parçası olarak hesap kaydında tutar; kuyara onları hiçbir
  tabloya kopyalamaz, okumaz ve kullanmaz. Hesap bilgileriyle aynı dayanakla tutulur ve
  hesabını sildiğinde silinir.
- **Profil.** Görünen adın ve cinsiyetin. Her hesapta eşitlenir.
- **Eşitleme izniyle gelen kayıtlar.** Yalnız eşitleme iznini verirsen: Gardırop parçaların
  (fotoğraflar hariç), Geçmişin (fotoğraflar hariç), giyim stilin ve stil özelliklerin, günlük
  seçimlerin, çıkış kayıtların (saat ve saat dilimi).
- **Güvenlik kayıtları.** Hesap hizmeti, oturum açma, oturumu yenileme ve oturumu kapatma
  işlemlerinin zamanını, IP adresini ve uygulamanın istekle gönderdiği istemci bilgisini
  kaydeder. Açık bir oturumun kaydı da aynı IP adresini ve istemci bilgisini tutar.
- **Üye sayacı.** kuyara'nın sunucusu, üyelerin günlük "Stiliste tekrar sor" hakkını saymak ve
  hesap silmeyi yapmak için hesap kimliğini oturum anahtarından okur. Anahtar hesabının
  e-posta adresini ve Google ile girdiysen Google'ın gönderdiği adı ve fotoğrafı da içerir;
  sunucu bunları okumaz ve loglamaz, hiçbiri yapay zeka sağlayıcısına gitmez.
- **Eşitleme izni kaydı.** Eşitleme iznine verdiğin her cevap (verildi ya da geri çekildi),
  gösterilen metnin sürümü ve zamanı.
- **Başvuru yazışmaları.** Bize yazdığın e-postalar ve yanıtlarımız.

Doğum tarihin, analitik izni ve diğer izin tercihlerin, bildirim ayarın, dil ve görünüm
ayarların, konumların ve fotoğrafların hesaba gitmez. Hesap verilerin hiçbir yapay zeka
isteğine girmez. Analitik hiçbir zaman hesabına bağlanmaz: kuyara analitik kimliğini
hesabınla hiç ilişkilendirmez, bu yüzden analitik işleyicisinde hesaba ait veri bulunmaz.

**Amaçlar ve hukuki sebepler.**

| Veri | Amaç | KVKK | GDPR |
| --- | --- | --- | --- |
| Hesap bilgileri, görünen ad, cinsiyet | Hesabı açmak ve çalıştırmak, profilini telefonlarına getirmek | Sözleşmenin kurulması ve ifası (md. 5/2-c) | Sözleşme (md. 6/1-b) |
| Eşitleme izniyle gelen kayıtlar | Kayıtları yeni telefona ve yeniden kurulan uygulamaya getirmek, telefonlar arasında eşitlemek | Açık rıza (md. 6/3-a; özel nitelikli sayılabilir) | Açık rıza (md. 6/1-a; özel nitelikli sayılırsa md. 9/2-a) |
| Güvenlik kayıtları | Hesabı kötüye kullanıma karşı korumak | Meşru menfaat (md. 5/2-f) | Meşru menfaat (md. 6/1-f) |
| Üye sayacı | Üye hakkını saymak, hesabı silmek | Sözleşmenin ifası (md. 5/2-c) | Sözleşme (md. 6/1-b) |
| Eşitleme izni kaydı | İznin verildiğini ya da geri çekildiğini kanıtlamak | Hukuki yükümlülük ve bir hakkın korunması (md. 5/2-ç ve md. 5/2-e) | Hukuki yükümlülük (md. 6/1-c, md. 7/1 ile birlikte) |
| Başvuru yazışmaları | Haklarına ilişkin başvuruları yanıtlamak | Hukuki yükümlülük (md. 5/2-ç) | Hukuki yükümlülük (md. 6/1-c) |

**Toplama yöntemi.** Veriler, Apple ya da Google ile oturum açtığında ve uygulamayı
kullandığında uygulama üzerinden, otomatik yollarla, elektronik ortamda toplanır. Başvuru
yazışmaları e-postayla gelir.

**Kimlere aktarılır.**

- **Supabase Inc. (ABD).** Hesap ve veritabanı hizmetini kuyara adına veri işleyen olarak
  sağlar. Veriler Frankfurt, Almanya'daki sunucularda tutulur. Supabase'in alt işleyenleri
  arasında Amazon Web Services vardır. Destek ve bakım için ABD'den erişim olabilir. Alt işleyen
  listesi:
  [supabase.com/legal/customer-resources/subprocessor-list](https://supabase.com/legal/customer-resources/subprocessor-list).
- **Cloudflare, Inc. (ABD).** kuyara'nın sunucusu Cloudflare'da çalışır. Cloudflare, kuyara
  adına veri işleyen olarak, telefonunun gönderdiği oturum anahtarını işler; anahtar hesap
  kimliğini, hesabının e-posta adresini ve Google ile girdiysen Google'ın gönderdiği adı ve
  fotoğrafı içerir. Sunucu bundan yalnız hesap kimliğini, üye sayacı ve hesap silme için okur
  ve hiçbirini loglamaz. Cloudflare'ın sunucuları birçok ülkededir.
- **Apple ve Google.** Oturum açtığın hesabın sağlayıcılarıdır ve kendi gizlilik
  politikalarına göre çalışır. Apple ile Giriş Yap kullanan bir hesabı sildiğinde kuyara, oturum
  izninin iptalini Apple'dan ister.
- **Yetkili kamu kurumları.** Yalnız kanun gerektirdiğinde.

**Yurt dışına aktarım.** Hesap verilerin Türkiye dışında, Almanya'da tutulur ve ABD'den
erişilebilir. Bu aktarım Supabase'in Veri İşleme Eki'ne (Data Processing Addendum) ve içerdiği
standart sözleşme maddelerine dayanır. AB'de yaşıyorsan, AB dışına olası erişim de aynı
maddelere dayanır. Oturum anahtarın kuyara'nın sunucusunda da işlendiği için Cloudflare'ın Türkiye
dışındaki sunucularına aktarılabilir; bu aktarım Cloudflare'ın veri işleme sözleşmesine dayanır.

**Ne kadar saklanır.**

- Hesap bilgileri ve profil: hesabını silene kadar.
- Eşitleme izniyle gelen kayıtlar: izni geri çekene ya da hesabını silene kadar. Bir kaydı
  uygulamada silersen hesaptaki kopyasının içeriği telefonun bir sonraki eşitlemesinde silinir.
  Silmenin öbür telefonlarına da ulaşabilmesi için hesapta yalnız kaydın kimliği, varsa günü
  ve oluşturulma, değişme ve silinme zamanları kalır; izni geri çektiğinde ya da hesabını
  sildiğinde bunlar da silinir.
- Elle alınan yedekler: hesap hizmetinin otomatik yedeği yoktur. Geliştirici veritabanını elle
  ve şifreli olarak, anahtarını ayrı tutarak yedekler ve her yedeği en geç 30 gün
  sonra siler. Silinen veriler, silinen bir hesap da dahil, bu yedeklerde en çok
  30 gün kalır. Yedekler yalnız bir arızadan sonra geri yükleme için tutulur. Bir yedek geri
  yüklenirse, o yedek alındıktan sonra silinmiş bir hesap ya da geri çekilmiş bir izin geri
  gelebilir. Bu olursa geliştirici bütün üyelere geri yüklemeyi e-postayla bildirir ve üyenin
  isteği üzerine böyle bir hesabı yeniden siler ya da bu kayıtları yeniden kaldırır.
- Güvenlik kayıtları: oturum işlemlerinin kayıtları veritabanına yazılmaz; hesap hizmetinin
  kayıt deposunda kısa süre tutulur ve kuyara'nın kullandığı planda en çok 1 gün geriye
  görüntülenebilir. Açık bir oturumun kaydı, oturum kapanana ya da hesabın silinene kadar
  durur.
- Üye sayacı: yalnız günün istek sayısı, hesap kimliğinden türetilen bir ad altında tutulur;
  saklanan sayı kimlik içermez. Hesapla birlikte silinmez, en geç 7 gün içinde kendiliğinden
  silinir.
- Eşitleme izni kaydı: hesabını silene kadar.
- Başvuru yazışmaları: başvuru sonuçlandıktan sonra 2 yıl.

**Hesabı ve izni yönetmek.** Görünen adını ve cinsiyetini Profil'den değiştirebilirsin.
Eşitleme iznini Ayarlar > Hesap'tan verebilir ya da geri çekebilirsin. Geri çektiğinde bu
kayıtların hesaptaki kopyaları silinir. Hesabını Ayarlar > Hesap'tan silebilirsin. Sen
olduğunu Apple ya da Google ile onayladıktan sonra silme hesaptaki her şeyi siler. Hesabın
Apple ile Giriş Yap kullanıyorsa kuyara, Apple izin verdiği ölçüde
Apple ile giriş bağlantını koparır; koparamazsa uygulama, kuyara'yı iPhone'unda Ayarlar >
adın > Apple ile Giriş Yap bölümünden kaldırmanı söyler.

**Hakların.** KVKK md. 11 uyarınca şunları isteyebilirsin: verilerinin işlenip işlenmediğini
öğrenmek, işlendiyse bilgi istemek, işleme amacını ve amaca uygun kullanılıp kullanılmadığını
öğrenmek, yurt içinde ya da yurt dışında aktarıldığı kişileri bilmek, eksik ya da yanlış
işlenmişse düzeltilmesini istemek, silinmesini ya da yok edilmesini istemek, bu düzeltme ve
silmenin aktarılan kişilere bildirilmesini istemek, yalnız otomatik sistemlerle analiz sonucu
aleyhine çıkan bir sonuca itiraz etmek, kanuna aykırı işleme yüzünden zarara uğradıysan
zararının giderilmesini istemek. AB'de yaşıyorsan GDPR uyarınca ayrıca erişim, düzeltme,
silme, işlemeyi kısıtlama, itiraz ve veri taşınabilirliği haklarına sahipsin ve rızanı
istediğin zaman geri çekebilirsin. kuyara hesap verilerinle hakkında sonuç doğuran otomatik bir
karar vermez.

**Nasıl başvurulur.** [quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com)
adresine, hesabındaki e-posta adresinden yaz. Başvuruyu yalnız hesabında kayıtlı e-posta
adresinde yanıtlarız, gönderenin başka bir adresinde asla. Başka bir adresten yazarsan
kimliğini doğrulamak için hesabındaki adrese bir e-posta göndeririz; o adresten yanıtlaman
yeterli. Apple ile "E-postamı
Gizle"yi seçtiysen bu e-posta sana Apple'ın yönlendirmesiyle ulaşır. Başvurunu yazılı olarak
posta yoluyla da gönderebilirsin; posta adresini e-postayla istediğinde paylaşırız. Yazılı
başvuruda adın, soyadın ve imzan, T.C. vatandaşıysan T.C. kimlik numaran, değilsen uyruğun ve
pasaport ya da kimlik numaran, tebligat için adresin ve talebin yer almalı (Veri Sorumlusuna
Başvuru Usul ve Esasları Hakkında Tebliğ). Başvurunu en geç 30 gün içinde ücretsiz yanıtlarız
(GDPR için en geç bir ay; karmaşık başvurularda haber vererek iki ay uzayabilir). Verilerinin
kopyasını istersen makinece okunabilir bir JSON dosyası olarak şifreli, hesabında kayıtlı adrese göndeririz; sen o
adresten doğruladıktan sonra şifreyi ayrı bir iletiyle iletiriz.

**Şikâyet.** Başvurun reddedilirse, yanıtı yetersiz bulursan ya da 30 gün içinde yanıt
alamazsan, yanıtı öğrendiğin tarihten itibaren 30 gün içinde ve her durumda başvuru tarihinden
itibaren 60 gün içinde Kişisel Verileri Koruma Kurulu'na şikâyette bulunabilirsin (KVKK md.
14). AB'de yaşıyorsan, yaşadığın ya da çalıştığın ülkedeki veri koruma otoritesine şikâyette
bulunabilirsin.

## Değişiklikler

Bu politikadaki değişiklikler yeni bir yürürlük tarihiyle bu adreste yayınlanır.

## İletişim

Veri sorumlusu: ubrn. Sorular, silme talepleri, veri kopyası ve diğer başvurular için:
[quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). Yazılı başvurular için posta
adresini e-postayla istediğinde paylaşırız. Hata bildirimleri için [destek sayfasına](support)
bak.
