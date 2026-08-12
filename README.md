# ⚽ 3-2-1 Futbol Kesişim Oyunu

Harman'ın YouTube'daki **3-2-1** oyunundan ilham alınan, tarayıcıda çalışan futbol bilgi oyunu.

## Nasıl Oynanır?

İki kriter seç — **kulüp** veya **milliyet** — ve her ikisine de uyan oyuncuları bul.

| Kombinasyon | Örnek |
|---|---|
| Kulüp × Kulüp | Real Madrid + Arsenal'de oynamış oyuncular |
| Milliyet × Kulüp | Brezilyalı + Barcelona'da oynamış oyuncular |

## Özellikler

- 🔍 Yazarken canlı autocomplete
- ⚡ Anlık kesişim sorgusu (Set tabanlı, gecikmesiz)
- 🌙 Karanlık mod
- 📱 Mobil uyumlu
- 🚫 Backend yok — tüm veri client-side

## Kurulum

```bash
# Repo'yu klonla
git clone https://github.com/gkkckn/futbol-kesisim.git
cd futbol-kesisim

# players_filtered_v2.csv dosyasını klasöre ekle (paylaşılmıyor)

# Local server başlat
npx serve .
```

> **Not:** Oyuncu verisi (`*.csv`) gizlilik nedeniyle repoya dahil edilmemiştir.
