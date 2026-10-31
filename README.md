# Marble Sort Bot

> **Onur'a not:** Selam Onur! "Hackleyebilirsin" demiştin ya, ciddiye aldım :)
> Marble Sort'a solver bot yazdım. Oyun motorunu simüle edip en iyi kutu sırasını
> buluyor, bandı yıldız sınırının altında tutmaya çalışıyor, kutuları da güvenli
> olduğu anda üst üste bırakıyor. Sıralamada tepedeysem sebebi bu, king bende
> kalsın artık :D
>
> Bir fikir: botlar için ayrı bir "bot ligi" açsan nasıl olur? Solver yazan herkes
> orada kapışsın, ilk başvuru benden :)
>
> İsmail


Onur'un Marble Sort oyununun normal modu için otomatik oyuncu ve hamle yardımcısı.
Sürüm: 1.5.0. Yeni: panelde "Hız çarpanı" (oyunun 3x sınırını aşar, 10 önerilir).
31 Ekim 2026 tarihinde yüklenen HAR içindeki oyun koduna göre hazırlanmıştır.

## 1.4.1 düzeltmesi

- 67. bölüm gibi durumlarda bot çözümsüz bir duruma girip sonsuza kadar
  "plan bulunamadı" diye bekliyordu. Artık plan seçilince üst üste bırakma fizik
  kopyasında baştan sona denenir; çıkmaza giriyorsa o bölüm kutular tek tek
  açılarak oynanır. Toplar durduğunda plan canlı duruma göre tekrar doğrulanır.
  Yine de plan bulunamazsa bölüm yeniden başlatılır.
- 60-70 arası 20 denemede: 20/20 kazanma, 49 yıldız (eski 47), süre 1037 s (eski 1173 s).

## 1.4.0 yenilikleri

- Kutular güvenli olduğu anda üst üste bırakılır. Bot, banta girebilecek tüm
  toplar + yeni kutu ulaşılan yıldız seviyesinin sınırını aşmıyorsa beklemez.
  Bu, bantın tıkanmasını da önler. Toplar durduğunda kutu sığmıyorsa açmadan önce
  o kutu fizik kopyasında denenir.
- Turbo seçeneği (kapalı): sınırı planın tahmini yıldız seviyesine kadar gevşetir. Daha hızlı, yıldız biraz düşebilir.
- Lider farkı (varsayılan 1000): 1. sıradayken 2. ile fark bu değere ulaşınca bot
  bölüm sonu ekranında bekler. Fark düşer veya sıra kaybedilirse devam eder.
  0 yazınca kapanır. Veri sıralama panelinden gelir (15 saniyede bir).
- Ölçüm (motor simülasyonu, 10 bölüm x 2 ekran x 3 tohum = 60 deneme, arama dahil):
  1.3.0: 4547 s, 94 yıldız. 1.4.0: 3441 s, 99 yıldız. Turbo: 2975 s, 90 yıldız.
  Ölç: `node test-speed.mjs marble-sort-bot.user.js 5,10,20 77`

## Tek kodla yeniden çalıştırma

Bu paket botu ve sıralama panelini birlikte içerir. `start.js` dosyasını
metin düzenleyicide açıp tamamını oyunun F12 > Console alanına yapıştır.
Panelden Başlat'a bas. Aynı kod zaten yüklüyse ikinci bot oluşturmaz.

Sıralama paneli senin satırını, önündeki en fazla 3 oyuncuyu ve hemen arkandaki
oyuncuyu puan farklarıyla gösterir. 15 saniyede bir yalnızca sıralama verisini
okur. API yanıtında bir komşu sıra yoksa bunu belirtir.

Kısa talimatlar `KURULUM.txt` dosyasındadır. ZIP kodların yedeğidir; oyuncu
ilerlemesi, özel kimlikler veya oturum anahtarları içermez. İlerleme oyunun
mevcut tarayıcı kaydından gelir.

## Dosyaları ayrı çalıştırma

1. Oyunu bilgisayarda Chrome'da aç: https://marblesort.onurtirpan.io/
2. F12 ile geliştirici araçlarını aç ve Console sekmesine geç.
3. Oyunda normal bir bölüm başlat.
4. Bu paketteki `marble-sort-bot.user.js` dosyasını bir metin düzenleyicide aç.
5. Dosyanın tamamını kopyala, oyun sekmesinin Console alanına yapıştır ve Enter'a bas.
6. Sağ üstte çıkan bot panelinde Başlat'a bas.

Başlat bölüm bitene kadar otomatik hamle yapar. Sonraki bölüme otomatik geçme
ve oyunun 3x hızı başlangıçta açıktır. Bot önce 3 yıldızlık güvenli plan arar.
Bulamazsa en iyi bulduğu planla devam eder. Her bölüme 3 yıldız garanti değildir.

Önceki sürüm yüklüyse yeni kod onu kapatıp kendi panelini açar. Sayfayı
yenilemene gerek yoktur.

- Başlat'a basınca oyunun mevcut 3x hızını seçer. Zaten 3x kullanıyorsan bir kez
  daha üçe katlanmaz. 3 yıldız için gereken beklemelerden dolayı eski hızlı moddan
  daha yavaş olabilir. Gerçek süre bilgisayarına ve arama süresine de bağlıdır.
- Varsayılan öncelik devam etmektir. 3 yıldızlık güvenli plan yoksa yıldız
  hesabında en iyi bulduğu diğer planı dener. Kaybedilen veya takılan mevcut
  bölümü yeniden oynar. Plan hiç bulunamazsa 5 saniye sonra aramayı tekrar dener.
- "3 yıldız şart: çözüm yoksa dur" seçeneği başlangıçta kapalıdır. Açarsan yalnızca
  güvenli 3 yıldızlık planları kabul eder; çözüm bulunamazsa durur. Bir planın
  reddedilmesi 3 yıldızın imkansız olduğunu kanıtlamaz; kullanılan sınır ihtiyatlıdır.
- Bölüm planını saklar; her hamlede baştan arama yapmaz. 3 yıldız korumasında
  kutuları sırayla açar, önceki kutunun toplarının yerleşmesini bekler.
- Hedef bölüm başlangıçta 0'dır: sen durdurana kadar devam etmeyi dener.
  Belirli bir bölümde durması için hedef numarası yazabilirsin.
- Kodda tanımlı bir son bölüm yoktur. Bölümler numaraya göre üretilir.
- Oyun sekmesini görünür tut. Sekme gizlenince bot yeni hamleleri bekletir;
  oyun da kendi görünürlük kontrolüyle duraklayabilir.

## Gece açık bırakma, kilit ve uyku

Bu sürüm görünür oyun sekmesinde çalışır. Kaynak kodunda sekme gizlenince
oyunu duraklatan bir görünürlük denetimi vardır; bot da gizli sekmede hamle yapmaz.
Kilit ekranında veya arka planda çalışacağına güvenme. PC uykuya geçerse çalışmaz.
Gece devam etmesi için PC uyanık, oyun sekmesi görünür kalmalıdır. Bir hata,
tarayıcının durması veya uyku karşısında kesintisiz çalışma garantisi yoktur.

## İlerlemenin korunması

Güncelleme oyunun bölüm numarasını, parasını veya tamamlanmış bölümlerini
sıfırlamaz. Açık sekmede yeni kodu yapıştırmak mevcut oyun nesnesini korur;
sayfayı yenilemen gerekmez. Örneğin 12. bölümdeysen aynı bölümden devam edersin.
Oyunun normal bölüm sonu kayıt işlemi kendi akışında çalışır.

Tamamlanmış bölümlerin eski yıldızları geriye dönük değişmez. Mevcut bölümde
3 yıldız sınırı zaten aşılmışsa bu bilgi silinmez. Yalnızca 3 yıldız şartı açıkken
bu nedenle durur; varsayılan sürekli modda en iyi planla ilerlemeye çalışır.
Kaybederse veya uzun süre takılırsa mevcut bölümü yeniden dener. Bu, tamamlanan
bölümleri sıfırlamaz.

- Durdur: yeni hamleleri durdurur. Oyunun mevcut animasyonu normal devam eder.
- İpucu: önerilen kutuyu mavi bir çerçeveyle gösterir; hamle yapmaz.
- Tek hamle: önerilen bir kutuyu açar ve bekler.
- X: botu durdurup paneli gizler.

Paneli tekrar göstermek için Console'a yaz:

```js
MarbleSortBot.show()
```

Botu tamamen kaldırmak için sayfayı yenile veya şunu çalıştır:

```js
MarbleSortBot.destroy()
```

Sayfa yenilenince kodu yeniden çalıştırman gerekir. Alternatif olarak dosya,
zaten kullandığın bir userscript yöneticisinde de çalışabilecek başlık içerir.

## Nasıl karar veriyor?

Bot oyunun mevcut `window.__ms.app.game` nesnesini okur. Kutular, renkler,
boş alanlar, bant ve tepsiler bu nesnede bulunur. Gizli renkleri ve üreticilerin
sıradaki kutularını da kullanır; yalnızca ekranda görünen bilgilerle sınırlı değildir.

Önce 3 yıldızlık plan için 512 durum genişliğinde beam search yapar.
Gerektiğinde 2048 durumla tekrar dener. En iyi bulunan planı 100 ms / 6000 düğüm sınırında ek
aramayla iyileştirir. En fazla üç farklı başlangıç hamlesinin tam planlarını,
oyunun kendi fizik motorunun ayrı kopyalarında bölüm sonuna kadar dener.

3 yıldız korumasında bant, huni ve kutulardan düşmekte olan topların toplamı ile
yeni kutudaki topları birlikte sayar. Toplam, kapasitenin %60'ını geçecekse kutuyu
açmaz. Böylece botun kendi hamlesiyle yayımladığı toplar yıldız sınırını aşamaz.
Planı saklar; beklenmeyen durumda yeniden hesaplar. Önceden aşılan zirveyi silmez.
Bu şartlarla çözüm bulunamazsa varsayılan sürekli modda 512 durum genişliğinde
yıldız sayısını öncelikleyen diğer planları arar. Bu ikinci tür planda 3 yıldız
üst sınırını garanti edemez.

3 yıldız koruması kapalıyken hızlı modda planları peş peşe kutu açma politikasıyla da simüle eder. Hızlı bir
plan bulamazsa sırayla açılan bir planla devam eder. Planı saklar; beklenmeyen
oyun durumu, elle yapılan hamle veya devamı güvenli görünmeyen bir plan varsa
yeniden hesaplar. Hareket sırasında yeni kutu açarken bant, huni ve düşen topların
toplam sayısını dikkate alır. Bekleyen toplar tamamen durduğunda kapasitesi dar
bir hamleyi ayrıca motor kopyasında kontrol eder.

Gerçek oyunda normal `game.tap()` metodunu çağırır. Hamleler için tek tek API
isteği oluşturmaz; bölüm bitince oyunun kendi sonuç gönderme akışı çalışır.

Kodda normal mod yıldız hesabı şöyle:

| Bölüm boyunca en yüksek bant doluluğu | Yıldız |
| --- | --- |
| Kapasitenin en fazla %60'ı | 3 |
| Kapasitenin %60'ından fazlası, en fazla %85'i | 2 |
| Kapasitenin %85'inden fazlası | 1 |

Bu tablo yıldız hesabıdır. Sunucunun sıralama puanı formülü HAR içinde yoktur.

## Sınırlar

- Bu sürüm normal mod içindir. Mega modunda durur.
- Arama sınırlıdır ve fizik motoru rastgelelik içerir. Her zaman küresel optimum
  hamle veya 3 yıldız garantisi vermez. Seçim, bulunan ve denenen planlar arasındadır.
- Paneldeki bölüm zirvesi bir tahmindir; gerçekleşen değer farklı olabilir.
- Daha önce yüksek bant doluluğuna ulaştıysan bot geçmiş zirveyi geri alamaz.
- Yeni sürümde `__ms` veya oyun veri yapısı değişirse botun güncellenmesi gerekir.
- Otomasyon oyunun kendi kazanma ve kayıt akışını kullanır. Oyun normalde
  sonuçları sıralamaya gönderiyorsa botla oynanan bölüm de bu akışı izler.

## Doğrulama

Botun karar verme kısmı, yüklenen HAR'dan çıkarılan değiştirilmemiş oyun
motoruyla test edildi. Sonradan bağlı tarayıcıda botun oynadığı ve sıralama
panelinin çalıştığı görüldü. Sunucunun puan hesaplama formülü doğrulanmadı.

Testler şunları kapsar:

- 16 bölümün iki ekran boyutunda tam oynanışı: 32 bölüm denemesi.
- Her hamlede yeniden planlanan dört oyun; ters ekran düzeni dahil.
- Gerçek mıknatıs hamlesinden sonra eksik toplu kutularla başlayan bir oyun.
- Fizik denemelerinin asıl oyun durumunu değiştirmemesi.
- Kopyalanan topların hedef tepsi bağlantılarının korunması.
- İptal edilen aramanın hamle yapmaması.
- 15 bölümde, iki ekran boyutunda ve iki fizik rastgelelik tohumuyla hızlı oynama:
  60 ek bölüm denemesi. 64., 250. ve 1000. bölümler dahil.
- 3 yıldız korumasında, plan bulunan oyunların 3 yıldızla tamamlanması ve plan
  bulunamayan durumlarda hamle yapılmaması ayrıca test edilir. Bu testlerde
  koruma nedeniyle durmak, bölüm kazanmak olarak sayılmaz.
- Sürekli modun önce 3 yıldızı denemesi, çözüm yoksa başka bir planla devam
  etmesi ve planlama sırasında oyun durumunu değiştirmemesi ayrıca test edilir.
- Hız karşılaştırması aynı planların 1x ve 3x sırayla açılmasına karşı yapılır.
  Süreler 60 FPS varsayımıyla motor simülasyonundan hesaplanır; kullanıcının
  bilgisayarında veya ağında ölçülmüş gerçek süreler değildir. Arama süresi bu
  animasyon karşılaştırmasına dahil değildir.

Normal mod sonuçları `test-results.json`, önceki 1.1 sürümündeki hızlı mod sonuçları
`fast-test-results.json`, 3 yıldız koruması sonuçları `perfect-test-results.json`
ve sürekli mod sonuçları `continuous-test-results.json` dosyasındadır.
Önceki hızlı modun 60 denemesi de kazanıldı.
58 karşılaştırılabilir denemede toplam simülasyon süresi, 1x sırayla oynama
düzenine göre 3.09 kat, 3x sırayla oynama düzenine göre 1.04 kat hızlıydı.
Bu sayılar arama süresini içermez. Hızlı mod ayrıca planı saklayarak gerçek
tarayıcıdaki tekrarlanan arama beklemesini azaltır.

Yeniden çalıştırmak için Node.js ile:

```sh
node test-engine.mjs
node test-fast.mjs
node test-perfect.mjs
node test-continuous.mjs
```

Ek paket kurulumu gerekmez. `engine/` klasöründeki altı JavaScript dosyası
yüklenen HAR'dan çıkarılmış test bağımlılıklarıdır. Botun sitede çalışması için
`start.js` dosyasını Console'a yapıştırman yeterlidir. HAR, oyuncu kimlikleri ve ağ kayıtları
bu pakete eklenmemiştir.
