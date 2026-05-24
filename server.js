const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── DATABASE POSTGRESQL ───────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ── SETUP TABLE ───────────────────────────────────────────────────
async function setupDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nama TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rekod_kompos (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      sebab TEXT,
      nasihat TEXT,
      ciri TEXT,
      uploaded_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS imbasan (
      id SERIAL PRIMARY KEY,
      rekod_id INTEGER,
      result TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Cipta admin default jika belum ada
  const check = await pool.query('SELECT * FROM admins WHERE username = $1', ['admin']);
  if (check.rows.length === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query('INSERT INTO admins (username, password, nama) VALUES ($1, $2, $3)', ['admin', hash, 'Admin']);
    console.log('✅ Admin default dicipta: admin / admin123');
  }

  console.log('✅ Database bersedia');
}

// ── UPLOAD GAMBAR ─────────────────────────────────────────────────
// Untuk Railway: simpan gambar sebagai base64 dalam database
// (Railway tidak ada persistent disk storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// ── MIDDLEWARE ────────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'kompos-rahsia-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production'
  }
}));

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Tidak dibenarkan. Sila log masuk sebagai admin.' });
}

// ── AUTH ──────────────────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
    const admin = result.rows[0];
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Nama pengguna atau kata laluan salah.' });
    }
    req.session.admin = { id: admin.id, username: admin.username, nama: admin.nama };
    res.json({ success: true, nama: admin.nama });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  if (req.session && req.session.admin) {
    res.json({ loggedIn: true, nama: req.session.admin.nama });
  } else {
    res.json({ loggedIn: false });
  }
});

// ── REKOD KOMPOS ──────────────────────────────────────────────────
app.post('/api/kompos/upload', requireAdmin, upload.single('gambar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Tiada gambar dihantar.' });
  const { status, confidence, sebab, nasihat, ciri } = req.body;

  try {
    // Simpan gambar sebagai base64 string dalam database
    const base64 = req.file.buffer.toString('base64');
    const dataURL = `data:${req.file.mimetype};base64,${base64}`;

    const result = await pool.query(
      `INSERT INTO rekod_kompos (filename, original_name, status, confidence, sebab, nasihat, ciri, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [dataURL, req.file.originalname, status, parseInt(confidence), sebab, nasihat, ciri, req.session.admin.nama]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/kompos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rekod_kompos ORDER BY created_at DESC');
    res.json(result.rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/kompos/terkini', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rekod_kompos ORDER BY created_at DESC LIMIT 1');
    res.json(result.rows[0] || null);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/kompos/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM rekod_kompos WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM imbasan WHERE rekod_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── IMBASAN ───────────────────────────────────────────────────────
app.post('/api/imbasan', async (req, res) => {
  const { rekod_id, result, confidence } = req.body;
  try {
    await pool.query('INSERT INTO imbasan (rekod_id, result, confidence) VALUES ($1, $2, $3)',
      [rekod_id || null, result, parseInt(confidence)]);
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false });
  }
});

// ── STATS ─────────────────────────────────────────────────────────
app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) FROM rekod_kompos');
    const matang = await pool.query("SELECT COUNT(*) FROM rekod_kompos WHERE status = 'SUDAH_MATANG'");
    const imbasan = await pool.query('SELECT COUNT(*) FROM imbasan');
    res.json({
      total: parseInt(total.rows[0].count),
      matang: parseInt(matang.rows[0].count),
      belum: parseInt(total.rows[0].count) - parseInt(matang.rows[0].count),
      totalImbasan: parseInt(imbasan.rows[0].count)
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── EXPORT CSV ────────────────────────────────────────────────────
app.get('/api/export/csv', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM rekod_kompos ORDER BY created_at DESC');
    const headers = ['ID','Nama Fail','Status','Keyakinan (%)','Sebab','Dimuat Naik Oleh','Tarikh'];
    const rows = result.rows.map(r => [
      r.id, r.original_name,
      r.status === 'SUDAH_MATANG' ? 'Sudah Matang' : 'Belum Matang',
      r.confidence,
      '"' + (r.sebab || '').replace(/"/g, '""') + '"',
      r.uploaded_by, r.created_at
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="laporan_kompos.csv"');
    res.send('\uFEFF' + csv);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── START ─────────────────────────────────────────────────────────
setupDB().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('🌿 ================================');
    console.log('   Sistem Kompos berjalan!');
    console.log('🌿 ================================');
    console.log(`   URL: http://localhost:${PORT}`);
    console.log(`   Admin: admin / admin123`);
    console.log('🌿 ================================');
    console.log('');
  });
}).catch(err => {
  console.error('❌ Gagal sambung database:', err.message);
  process.exit(1);
});
