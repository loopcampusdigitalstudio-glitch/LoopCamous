/* =========================================
   LoopCampus Digital Studio — Backend
   Node.js + Express + SQLite + Razorpay
   Secure admin API and payment webhook.
   ========================================= */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const validator = require('validator');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

// Safety: fail loud if secrets are missing in production
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'change-me-in-production') {
  console.error('FATAL: JWT_SECRET must be set in production');
  process.exit(1);
}

// Razorpay instance (optional — only if keys are provided)
let razorpay = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && RAZORPAY_KEY_ID.startsWith('rzp_')) {
  razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
  });
} else {
  console.log('Razorpay not configured — payments disabled');
}
});

// ---------- SQLite database ----------
const db = new sqlite3.Database('./loopcampus.db', (err) => {
  if (err) console.error('Database connection error:', err.message);
  else initializeDatabase();
});

function initializeDatabase() {
  db.serialize(() => {
    // Admins table
    db.run(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Site settings (singleton key/value)
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Services
    db.run(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        tag TEXT,
        description TEXT,
        published INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Packs
    db.run(`
      CREATE TABLE IF NOT EXISTS packs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price TEXT NOT NULL,
        badge TEXT,
        is_featured INTEGER DEFAULT 0,
        published INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Pack features
    db.run(`
      CREATE TABLE IF NOT EXISTS pack_features (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pack_id INTEGER NOT NULL,
        feature TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE
      )
    `);

    // Team members
    db.run(`
      CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT,
        description TEXT,
        image_url TEXT,
        published INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Payments log (idempotent webhook handling)
    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        razorpay_payment_id TEXT PRIMARY KEY,
        razorpay_order_id TEXT NOT NULL,
        razorpay_signature TEXT,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL,
        pack_name TEXT,
        customer_email TEXT,
        customer_name TEXT,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        verified INTEGER DEFAULT 0
      )
    `);

    // Seed default admin if none exists
    db.get('SELECT id FROM admins LIMIT 1', (err, row) => {
      if (err) {
        console.error('Seed check error:', err.message);
        return;
      }
      if (!row) {
        const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'loopcampus@2024', 10);
        db.run(
          'INSERT INTO admins (email, password_hash, role) VALUES (?, ?, ?)',
          [process.env.ADMIN_USERNAME || 'loopcampus.online', hash, 'admin'],
          (err) => {
            if (err) console.error('Seed admin error:', err.message);
            else console.log(`Seeded default admin: ${process.env.ADMIN_USERNAME || 'loopcampus.online'} / ${process.env.ADMIN_PASSWORD || 'loopcampus@2024'}`);
          }
        );
      }
    });

    // Seed default settings if empty
    db.get('SELECT key FROM settings LIMIT 1', (err, row) => {
      if (err) {
        console.error('Seed settings check error:', err.message);
        return;
      }
      if (!row) {
        const defaults = [
          ['hero_title', 'Get your business found online'],
          ['hero_sub', "We're a student-run digital studio helping local shops, cafés, tuition centres and salons show up on Google and Instagram — without agency prices."],
          ['problem_title', 'Why local businesses need us'],
          ['problem_intro', 'Small shops and salons lose customers every day because they\'re hard to find online.'],
          ['services_title', 'What we do'],
          ['services_intro', 'Packs built for small local businesses — pick one, or ask us for a custom mix.'],
          ['steps_title', 'How it works'],
          ['steps_intro', 'Five simple steps from hello to going live.'],
          ['packs_title', 'Our packs'],
          ['packs_intro', 'Simple pricing for small businesses. All prices are one-time setup fees in Indian rupees (₹).'],
          ['team_title', 'Meet the team'],
          ['team_intro', 'Students, supervised by a faculty mentor.'],
          ['contact_title', 'Get in touch'],
          ['contact_intro', 'Have a shop, café, tuition centre or salon? Let\'s talk.'],
          ['footer_name', 'Loop<span class="logo-accent">Campus</span> Digital Studio'],
          ['footer_note', 'A school-supervised student enterprise'],
          ['footer_year', '2026'],
          ['whatsapp', '9148156509'],
          ['contact_email', 'loopcampusdigitalstudio@gmail.com'],
          ['instagram', 'r4kunchi'],
        ];
        const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of defaults) stmt.run(k, v);
        stmt.finalize();
        console.log('Seeded default settings.');
      }
    });

    // Seed default services
    db.get('SELECT id FROM services LIMIT 1', (err, row) => {
      if (err) return;
      if (!row) {
        const services = [
          ['Google Business Profile', 'Google', 'We set up and optimise your profile so customers find you on Google Search and Maps.', 1, 0],
          ['Instagram page and posts', 'Instagram', 'We create your Instagram page and design posts that showcase your shop, café or salon.', 1, 1],
          ['Logo and posters', 'Brand', 'Friendly logos and posters for your storefront, windows and social media.', 1, 2],
          ['30-day content calendar', 'Planning', 'A ready-to-post calendar so you always know what to share and when.', 1, 3],
        ];
        const stmt = db.prepare(
          'INSERT INTO services (title, tag, description, published, sort_order) VALUES (?, ?, ?, ?, ?)'
        );
        for (const s of services) stmt.run(...s);
        stmt.finalize();
        console.log('Seeded default services.');
      }
    });

    // Seed default packs
    db.get('SELECT id FROM packs LIMIT 1', (err, row) => {
      if (err) return;
      if (!row) {
        const packs = [
          ['Starter', '3,000', '', 0, 1, 0],
          ['Standard', '4,000', 'Most popular', 1, 1, 1],
          ['Plus', '5,000', '', 0, 1, 2],
        ];
        const stmt = db.prepare(
          'INSERT INTO packs (name, price, badge, is_featured, published, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const p of packs) stmt.run(...p);
        stmt.finalize(() => {
          // Seed pack features after packs are inserted
          db.all('SELECT id, name FROM packs', (err, rows) => {
            if (err) return;
            const featuresMap = {
              Starter: ['Google Business Profile setup', 'Basic Instagram page setup', 'One logo design'],
              Standard: ['Everything in Starter', 'Ten Instagram posts', '30-day content calendar', 'Three poster designs'],
              Plus: ['Everything in Standard', 'A month of weekly content', 'Five poster designs', 'Priority support'],
            };
            const featStmt = db.prepare(
              'INSERT INTO pack_features (pack_id, feature, sort_order) VALUES (?, ?, ?)'
            );
            for (const pack of rows) {
              const feats = featuresMap[pack.name] || [];
              feats.forEach((f, idx) => featStmt.run(pack.id, f, idx));
            }
            featStmt.finalize();
            console.log('Seeded default packs and features.');
          });
        });
      }
    });

    // Seed default team
    db.get('SELECT id FROM team_members LIMIT 1', (err, row) => {
      if (err) return;
      if (!row) {
        const team = [
          ['RAHUL KUNCHIPUDI', 'Founder & Lead Designer', 'Designs logos, posters and brand identity for local businesses.', null, 1, 0],
          ['ABHIGNYA HATHI', 'Social Media Lead', 'Runs Instagram pages and content calendars.', null, 1, 1],
          ['AGASTHYA SHASTRY', 'Google Business Lead', 'Helps businesses show up on Google Search and Maps.', null, 1, 2],
          ['VRISHA VISHWANATH', 'Content Creator', 'Writes captions and plans posts.', null, 1, 3],
          ['ALIYA SHAIKH', 'Client Manager', 'Your first point of contact for packs and approvals.', null, 1, 4],
          ['CHARVI', 'Photographer', 'Captures photos of your shop, café or salon.', null, 1, 5],
          ['THANSICA', 'Operations & Admin', 'Keeps schedules, approvals and deliveries on track.', null, 1, 6],
          ['Gagan Ponnappa', 'Faculty Mentor', 'School-supervised guidance and oversight of the studio.', null, 1, 7],
        ];
        const stmt = db.prepare(
          'INSERT INTO team_members (name, role, description, image_url, published, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const m of team) stmt.run(...m);
        stmt.finalize();
        console.log('Seeded default team.');
      }
    });
  });
}

// ---------- Middleware ----------
app.use(helmet());
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files (public site + admin dashboard)
app.use(express.static(path.join(__dirname, '..')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// Image upload directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1000);
    cb(null, unique + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'), false);
    cb(null, true);
  }
});

// Serve uploaded images
app.use('/uploads', express.static(uploadDir));

// Image upload endpoint (admin only)
app.post('/api/admin/upload-image', authenticateAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- Auth helpers ----------
function generateToken(admin) {
  return jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie('token', { path: '/' });
}

function authenticateAdmin(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = { id: decoded.id, email: decoded.email, role: decoded.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------- Routes ----------

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// --- Admin login ---
app.post('/api/admin/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Valid email/username and password required' });
  }

  db.get('SELECT * FROM admins WHERE email = ?', [email], (err, admin) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    bcrypt.compare(password, admin.password_hash, (err, match) => {
      if (err || !match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = generateToken(admin);
      setAuthCookie(res, token);
      res.json({ message: 'Logged in', admin: { id: admin.id, email: admin.email, role: admin.role } });
    });
  });
});

// --- Admin logout ---
app.post('/api/admin/logout', authenticateAdmin, (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out' });
});

// --- Admin me (check session) ---
app.get('/api/admin/me', authenticateAdmin, (req, res) => {
  res.json({ admin: req.admin });
});

// ================= PUBLIC CONTENT API =================
// These are read-only, no auth required. Used by the public website.

app.get('/api/public/settings', (req, res) => {
  db.all('SELECT key, value FROM settings', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const obj = {};
    rows.forEach((r) => (obj[r.key] = r.value));
    res.json(obj);
  });
});

app.get('/api/public/services', (req, res) => {
  db.all(
    'SELECT * FROM services WHERE published = 1 ORDER BY sort_order ASC, id ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

app.get('/api/public/packs', (req, res) => {
  db.all(
    'SELECT * FROM packs WHERE published = 1 ORDER BY sort_order ASC, id ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      // Load features for each pack
      const packIds = rows.map((p) => p.id).join(',');
      if (!packIds) return res.json(rows);
      db.all(
        `SELECT pack_id, feature, sort_order FROM pack_features WHERE pack_id IN (${packIds}) ORDER BY pack_id, sort_order`,
        (err2, features) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          const byPack = {};
          features.forEach((f) => {
            if (!byPack[f.pack_id]) byPack[f.pack_id] = [];
            byPack[f.pack_id].push(f.feature);
          });
          const result = rows.map((p) => ({
            ...p,
            features: byPack[p.id] || [],
          }));
          res.json(result);
        }
      );
    }
  );
});

app.get('/api/public/team', (req, res) => {
  db.all(
    'SELECT * FROM team_members WHERE published = 1 ORDER BY sort_order ASC, id ASC',
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

// ================= ADMIN CONTENT API =================
// Protected. Authenticated admins only.

// --- Settings ---
app.get('/api/admin/settings', authenticateAdmin, (req, res) => {
  db.all('SELECT key, value FROM settings', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const obj = {};
    rows.forEach((r) => (obj[r.key] = r.value));
    res.json(obj);
  });
});

app.put('/api/admin/settings', authenticateAdmin, (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'Invalid body' });
  }

  const keys = Object.keys(updates);
  if (keys.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    const stmt = db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP'
    );
    let completed = 0;
    keys.forEach((k) => {
      stmt.run(k, String(updates[k]), (err) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Database error' });
        }
        completed++;
        if (completed === keys.length) {
          db.run('COMMIT', (err) => {
            if (err) return res.status(500).json({ error: 'Commit failed' });
            res.json({ message: 'Settings saved' });
          });
        }
      });
    });
    stmt.finalize();
  });
});

// --- Services ---
app.get('/api/admin/services', authenticateAdmin, (req, res) => {
  db.all('SELECT * FROM services ORDER BY sort_order ASC, id ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/admin/services', authenticateAdmin, (req, res) => {
  const { title, tag, description, published, sort_order } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  db.run(
    'INSERT INTO services (title, tag, description, published, sort_order) VALUES (?, ?, ?, ?, ?)',
    [title, tag || '', description || '', published ? 1 : 0, sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.put('/api/admin/services/:id', authenticateAdmin, (req, res) => {
  const { title, tag, description, published, sort_order } = req.body;
  db.run(
    'UPDATE services SET title = COALESCE(?, title), tag = COALESCE(?, tag), description = COALESCE(?, description), published = COALESCE(?, published), sort_order = COALESCE(?, sort_order), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [title, tag, description, published, sort_order, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/admin/services/:id', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM services WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  });
});

// Reorder service
app.post('/api/admin/services/:id/move', authenticateAdmin, (req, res) => {
  const { direction } = req.body;
  if (direction !== -1 && direction !== 1) {
    return res.status(400).json({ error: 'Invalid direction' });
  }
  db.get(
    'SELECT sort_order FROM services WHERE id = ?',
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Not found' });
      const currentSort = row.sort_order;
      const targetSort = currentSort + direction;
      db.get(
        'SELECT id FROM services WHERE sort_order = ? AND id != ?',
        [targetSort, req.params.id],
        (err2, target) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          if (target) {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION');
              db.run(
                'UPDATE services SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [targetSort, req.params.id]
              );
              db.run(
                'UPDATE services SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [currentSort, target.id]
              );
              db.run('COMMIT', (err3) => {
                if (err3) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Reorder failed' });
                }
                res.json({ message: 'Reordered' });
              });
            });
          } else {
            res.json({ message: 'Cannot move further' });
          }
        }
      );
    }
  );
});

// --- Packs ---
app.get('/api/admin/packs', authenticateAdmin, (req, res) => {
  db.all('SELECT * FROM packs ORDER BY sort_order ASC, id ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    db.all('SELECT * FROM pack_features ORDER BY pack_id, sort_order', (err2, features) => {
      if (err2) return res.status(500).json({ error: 'Database error' });
      const byPack = {};
      features.forEach((f) => {
        if (!byPack[f.pack_id]) byPack[f.pack_id] = [];
        byPack[f.pack_id].push({ id: f.id, feature: f.feature, sort_order: f.sort_order });
      });
      const result = rows.map((p) => ({ ...p, features: byPack[p.id] || [] }));
      res.json(result);
    });
  });
});

app.post('/api/admin/packs', authenticateAdmin, (req, res) => {
  const { name, price, badge, is_featured, published, sort_order, features } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });
  db.run(
    'INSERT INTO packs (name, price, badge, is_featured, published, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [name, price, badge || '', is_featured ? 1 : 0, published ? 1 : 0, sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      const packId = this.lastID;
      if (features && Array.isArray(features)) {
        const stmt = db.prepare(
          'INSERT INTO pack_features (pack_id, feature, sort_order) VALUES (?, ?, ?)'
        );
        features.forEach((f, idx) => stmt.run(packId, f, idx));
        stmt.finalize();
      }
      res.status(201).json({ id: packId });
    }
  );
});

app.put('/api/admin/packs/:id', authenticateAdmin, (req, res) => {
  const { name, price, badge, is_featured, published, sort_order } = req.body;
  db.run(
    'UPDATE packs SET name = COALESCE(?, name), price = COALESCE(?, price), badge = COALESCE(?, badge), is_featured = COALESCE(?, is_featured), published = COALESCE(?, published), sort_order = COALESCE(?, sort_order), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, price, badge, is_featured, published, sort_order, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/admin/packs/:id', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM packs WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  });
});

// Reorder pack
app.post('/api/admin/packs/:id/move', authenticateAdmin, (req, res) => {
  const { direction } = req.body;
  if (direction !== -1 && direction !== 1) {
    return res.status(400).json({ error: 'Invalid direction' });
  }
  db.get(
    'SELECT sort_order FROM packs WHERE id = ?',
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Not found' });
      const currentSort = row.sort_order;
      const targetSort = currentSort + direction;
      db.get(
        'SELECT id FROM packs WHERE sort_order = ? AND id != ?',
        [targetSort, req.params.id],
        (err2, target) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          if (target) {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION');
              db.run(
                'UPDATE packs SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [targetSort, req.params.id]
              );
              db.run(
                'UPDATE packs SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [currentSort, target.id]
              );
              db.run('COMMIT', (err3) => {
                if (err3) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Reorder failed' });
                }
                res.json({ message: 'Reordered' });
              });
            });
          } else {
            res.json({ message: 'Cannot move further' });
          }
        }
      );
    }
  );
});

// Pack features CRUD
app.post('/api/admin/packs/:packId/features', authenticateAdmin, (req, res) => {
  const { feature, sort_order } = req.body;
  if (!feature) return res.status(400).json({ error: 'Feature text required' });
  db.run(
    'INSERT INTO pack_features (pack_id, feature, sort_order) VALUES (?, ?, ?)',
    [req.params.packId, feature, sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.delete('/api/admin/packs/:packId/features/:featureId', authenticateAdmin, (req, res) => {
  db.run(
    'DELETE FROM pack_features WHERE id = ? AND pack_id = ?',
    [req.params.featureId, req.params.packId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Deleted' });
    }
  );
});

// Update pack feature text
app.put('/api/admin/packs/:packId/features/:featureId', authenticateAdmin, (req, res) => {
  const { feature } = req.body;
  if (!feature) return res.status(400).json({ error: 'Feature text required' });
  db.run(
    'UPDATE pack_features SET feature = ? WHERE id = ? AND pack_id = ?',
    [feature, req.params.featureId, req.params.packId],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Updated' });
    }
  );
});

// --- Team members ---
app.get('/api/admin/team', authenticateAdmin, (req, res) => {
  db.all('SELECT * FROM team_members ORDER BY sort_order ASC, id ASC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/admin/team', authenticateAdmin, (req, res) => {
  const { name, role, description, image_url, published, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  db.run(
    'INSERT INTO team_members (name, role, description, image_url, published, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [name, role || '', description || '', image_url || null, published ? 1 : 0, sort_order || 0],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.status(201).json({ id: this.lastID });
    }
  );
});

app.put('/api/admin/team/:id', authenticateAdmin, (req, res) => {
  const { name, role, description, image_url, published, sort_order } = req.body;
  db.run(
    'UPDATE team_members SET name = COALESCE(?, name), role = COALESCE(?, role), description = COALESCE(?, description), image_url = COALESCE(?, image_url), published = COALESCE(?, published), sort_order = COALESCE(?, sort_order), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, role, description, image_url, published, sort_order, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ message: 'Updated' });
    }
  );
});

app.delete('/api/admin/team/:id', authenticateAdmin, (req, res) => {
  db.run('DELETE FROM team_members WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  });
});

// Reorder team member
app.post('/api/admin/team/:id/move', authenticateAdmin, (req, res) => {
  const { direction } = req.body;
  if (direction !== -1 && direction !== 1) {
    return res.status(400).json({ error: 'Invalid direction' });
  }
  db.get(
    'SELECT sort_order FROM team_members WHERE id = ?',
    [req.params.id],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Not found' });
      const currentSort = row.sort_order;
      const targetSort = currentSort + direction;
      db.get(
        'SELECT id FROM team_members WHERE sort_order = ? AND id != ?',
        [targetSort, req.params.id],
        (err2, target) => {
          if (err2) return res.status(500).json({ error: 'Database error' });
          if (target) {
            db.serialize(() => {
              db.run('BEGIN TRANSACTION');
              db.run(
                'UPDATE team_members SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [targetSort, req.params.id]
              );
              db.run(
                'UPDATE team_members SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [currentSort, target.id]
              );
              db.run('COMMIT', (err3) => {
                if (err3) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Reorder failed' });
                }
                res.json({ message: 'Reordered' });
              });
            });
          } else {
            res.json({ message: 'Cannot move further' });
          }
        }
      );
    }
  );
});

// ================= PAYMENTS (Razorpay Test Mode) =================

// Create order — frontend calls this when user clicks "Pay"
app.post('/api/payments/order', authenticateAdmin ? (req, res) => res.status(403).json({ error: 'Use public endpoint' }) : (req, res) => {
  // Public order creation — no admin auth needed for customers
  const { amount, currency = 'INR', pack_name, customer_name, customer_email } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valid amount required' });
  }
  if (!validator.isCurrency(String(amount), { symbol: '' })) {
    return res.status(400).json({ error: 'Invalid amount format' });
  }

  const amountInPaise = Math.round(parseFloat(amount) * 100); // Razorpay uses paise for INR

  const options = {
    amount: amountInPaise,
    currency,
    receipt: `rcpt_${Date.now()}`,
    notes: {
      pack_name: pack_name || '',
      customer_name: customer_name || '',
      customer_email: customer_email || '',
    },
  };

  razorpay.orders.create(options, (err, order) => {
    if (err) {
      console.error('Razorpay order error:', err);
      return res.status(500).json({ error: 'Failed to create payment order' });
    }
    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: RAZORPAY_KEY_ID, // public key safe for frontend
    });
  });
});

// Verify payment signature — frontend calls this after Razorpay checkout completes
app.post('/api/payments/verify', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment details' });
  }

  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature === razorpay_signature) {
    res.json({ verified: true, payment_id: razorpay_payment_id });
  } else {
    res.status(400).json({ verified: false, error: 'Signature mismatch' });
  }
});

// --- Razorpay webhook (server-to-server, authoritative) ---
// Configure this URL in Razorpay Dashboard: https://your-backend.onrender.com/api/payments/webhook
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = WEBHOOK_SECRET || RAZORPAY_KEY_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    return res.status(400).json({ error: 'Missing signature' });
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const payload = req.body;
  const event = payload.event;
  const payment = payload.payload.payment.entity;

  const paymentId = payment.id;
  const orderId = payment.order_id;
  const status = payment.status; // authorized, captured, failed, etc.
  const amount = payment.amount;
  const currency = payment.currency || 'INR';
  const email = payment.email || null;
  const contact = payment.contact || null;

  // Idempotency: ignore if already processed
  db.get('SELECT razorpay_payment_id FROM payments WHERE razorpay_payment_id = ?', [paymentId], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (row) {
      // Already processed — return OK to stop Razorpay retries
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Map Razorpay status to our internal status
    let internalStatus = 'pending';
    let verified = 0;
    if (status === 'captured') {
      internalStatus = 'success';
      verified = 1;
    } else if (status === 'failed') {
      internalStatus = 'failed';
      verified = 1;
    } else if (status === 'authorized') {
      internalStatus = 'pending';
    } else {
      internalStatus = 'pending';
    }

    db.run(
      `INSERT INTO payments (razorpay_payment_id, razorpay_order_id, razorpay_signature, amount, currency, status, customer_email, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [paymentId, orderId, payment.signature || null, amount, currency, internalStatus, email, verified],
      (err) => {
        if (err) {
          console.error('Webhook insert error:', err.message);
          return res.status(500).json({ error: 'Database error' });
        }
        console.log(`Payment webhook: ${paymentId} status=${internalStatus} verified=${verified}`);
        res.status(200).json({ received: true });
      }
    );
  });
});

// --- Get payment status (authenticated admin or customer with order id) ---
app.get('/api/payments/status/:orderId', (req, res) => {
  const { orderId } = req.params;
  db.get(
    'SELECT * FROM payments WHERE razorpay_order_id = ? ORDER BY received_at DESC LIMIT 1',
    [orderId],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!row) return res.status(404).json({ error: 'Payment not found' });
      res.json({
        payment_id: row.razorpay_payment_id,
        status: row.status,
        amount: row.amount,
        currency: row.currency,
        verified: row.verified,
        received_at: row.received_at,
      });
    }
  );
});

// ---------- Serve HTML pages ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'));
});

// 404 JSON for API routes only
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`LoopCampus backend running on http://localhost:${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Razorpay mode: ${RAZORPAY_KEY_ID ? 'configured' : 'NOT CONFIGURED'}`);
});

module.exports = app;
