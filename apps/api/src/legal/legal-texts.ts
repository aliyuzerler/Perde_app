/**
 * Türkçe yasal metin gövdeleri (Markdown). Sürüm bilgisi controller'dadır.
 * Metinler şablon niteliğindedir; yayın öncesi hukuk incelemesi gerekir
 * (docs/RELEASE_PLAN.md onay kapısı).
 */
export const TERMS_TEXT = `# PerdeGo Kullanım Koşulları

## 1. Hizmetin Kapsamı
PerdeGo; dikey (portre format) kısa film, mini dizi ve belgesel içeriklerin
izlendiği bir dijital yayın platformudur. Bu koşullar, uygulamayı indiren,
üye olan veya misafir olarak kullanan herkes için geçerlidir.

## 2. Hesap
- Hesap açmak için geçerli bir e-posta adresi ve 18 yaşından büyük olma
  şartı aranır (18+ içerik doğum yılı kontrolüyle ayrıca korunur).
- Parolanızı üçüncü kişilerle paylaşmayınız; hesabınızdan yapılan
  işlemlerden siz sorumlusunuz.
- Hesabınızı dilediğiniz an silebilirsiniz. Silme talebinde kişisel
  verileriniz nefallet süresi (30 gün) sonunda kalıcı olarak silinir veya
  anonimleştirilir; yasal saklama yükümlülüğü altındaki finansal kayıtlar
  saklanır.

## 3. Abonelik ve Kredi
- Üyelere özel içerikler aylık/3 aylık/yıllık abonelikle veya bölüm başına
  kredi ile açılır. Ücretler ödeme anında gösterilir.
- Abonelikler dönem sonuna kadar etkilidir; iade koşulları mağaza
  politikalarına tabidir. İlk 7 gün ücretsiz deneme sunulur.
- Krediler iade edilmez; açılmayan bölüm için teknik arıza durumunda kredi
  iadesi yapılır.

## 4. Kullanım Kuralları
Hizmeti yeniden satmak, içerikleri kaydetmek/dağıtmak, tersine mühendislik
yapmak, platformu otomatik araçlarla taramak yasaktır. İhlal halinde hesap
askıya alınabilir.

## 5. Fikri Mülkiyet
İçeriklerin tüm hakları yapımcılarına aittir. PerdeGo, sınırlı, geri
alınabilir, münhasır olmayan izleme izni verir.

## 6. Sorumluluğun Sınırlandırılması
Hizmet "olduğu gibi" sunulur; kesintiler, içerik değişiklikleri ve üçüncü
taraf altyapı arızalarından doğan dolaylı zararlardan sorumlu tutulamaz.

## 7. Değişiklikler ve Uygulanacak Hukuk
Koşullar güncellenebilir; önemli değişikliklerde uygulama içi bildirim
yapılır. Uyuşmazlıklarda Türkiye Cumhuriyeti hukuku uygulanır.
`;

export const PRIVACY_TEXT = `# PerdeGo Gizlilik Politikası

## 1. Toplanan Veriler
- **Hesap:** e-posta, görünen ad, parolanızın yalnızca argon2id özeti
  (ham parola asla saklanmaz), dil tercihi, doğum yılı (yalnızca yaş
  kontrolü; zorunlu değil).
- **Kullanım:** izleme geçmişi, favoriler, oynatma konumu (kaldığın yerden
  devam özelliği için), cihaz platformu ve oturum metni.
- **Ödeme:** mağaza işlemlerinin kimlik/işlem numaraları. Kart bilgileri
  tarafımızca ALINMAZ; mağazalarda (App Store / Google Play) saklanır.
- **Teknik:** IP adresinin yalnızca tek yönlü SHA-256 özeti (oturum
  güvenliği), hata kayıtları.

## 2. Amaçlar ve Hukuki Sebep
Veriler hizmet sunumu (sözleşme), güvenlik/dolandırıcılık önleme (meşru
menfaat) ve yasal yükümlülükler için işlenir. Reklam amaçlı profil çıkarma
YAPILMAZ.

## 3. Paylaşım
Veriler; video altyapısı sağlayıcıları, ödeme mağazaları ve yasal zorunluluk
halinde yetkili merciler dışında üçüncü taraflarla paylaşılmaz. Yurt dışına
aktarımda KVKK Art. 9 tedbirleri uygulanır.

## 4. Saklama Süreleri
- Hesap verileri: hesap silinene kadar. Silme talebinde 30 günlük nefallet
  süresi tanınır.
- Finansal kayıtlar: vergi mevzuatı gereği 10 yıl (anonimleştirilmiş).
- İzleme geçmişi: hesap silinince derhal silinir.
- Oturum kayıtları: en fazla 90 gün.

## 5. Haklarınız
KVKK m.11 uyarınca verilerinize erişme, düzeltme, silme ve işlemeye itiraz
etme haklarınız vardır. Talepleriniz için destek@perdego.app'e yazabilir
veya uygulama içi hesap silme akışını kullanabilirsiniz.

## 6. Çerezler ve İzleyiciler
Uygulama yalnızca zorunlu oturum depolaması kullanır; üçüncü taraf izleyici
ve reklam çerezi kullanılmaz.
`;
