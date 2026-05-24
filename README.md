# 🌿 Sistem Kompos - Panduan Setup

## Keperluan
- Windows 10
- Node.js (muat turun dari https://nodejs.org → versi LTS)

---

## Langkah Setup (Buat sekali sahaja)

1. **Ekstrak** folder `sistem-kompos` ke mana-mana lokasi (contoh: Desktop)

2. **Buka Command Prompt** dalam folder tersebut:
   - Buka folder `sistem-kompos`
   - Klik pada bar alamat di atas, taip `cmd`, tekan Enter

3. **Install pakej** (perlu internet, buat sekali sahaja):
   ```
   npm install
   ```
   Tunggu sehingga selesai (1-2 minit).

---

## Cara Jalankan Sistem

Setiap kali nak guna, buka Command Prompt dalam folder `sistem-kompos` dan taip:

```
npm start
```

Kemudian buka browser dan pergi ke:
```
http://localhost:3000
```

Untuk henti server, tekan `Ctrl + C` dalam Command Prompt.

---

## Akaun Admin Default

| Nama Pengguna | Kata Laluan |
|---------------|-------------|
| admin         | admin123    |

---

## Cara Guna

### Pengguna Biasa
- Buka `http://localhost:3000`
- Terus nampak UI imbas
- Klik **Ambil Foto / Imbas** untuk semak kematangan kompos

### Admin
- Klik butang **Admin** di sudut kanan atas
- Log masuk dengan kelayakan admin
- Muat naik gambar kompos sebagai rujukan
- Lihat sejarah dan eksport laporan

---

## Fail & Folder

```
sistem-kompos/
├── server.js          ← Server utama
├── package.json       ← Senarai pakej
├── kompos.db          ← Database SQLite (dijana otomatik)
├── uploads/           ← Gambar yang dimuat naik (dijana otomatik)
└── public/
    └── index.html     ← Antaramuka pengguna
```

---

## Nota
- Data disimpan dalam fail `kompos.db` (SQLite) — tiada internet diperlukan untuk database
- Gambar disimpan dalam folder `uploads/`
- Analisa kompos menggunakan kaedah pengesanan warna tempatan (percuma, tiada API)
