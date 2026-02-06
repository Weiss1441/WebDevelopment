// server.js — готовый рабочий сервер для Assignment 4 (Sessions & Security)
// ✅ Tasks fields: title, details, status, priority, category, deadline (+ createdAt, updatedAt)

const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId } = require('mongodb');

require('dotenv').config({ override: true });

const app = express();

// ===== ENV =====
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

const DB_NAME = process.env.DB_NAME || 'taskboard_db';
const TASKS_COLLECTION = process.env.TASKS_COLLECTION || 'tasks';
const USERS_COLLECTION = process.env.USERS_COLLECTION || 'users';

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is missing in .env');
  process.exit(1);
}
if (!SESSION_SECRET) {
  console.error('❌ SESSION_SECRET is missing in .env');
  process.exit(1);
}

// ===== DB =====
const client = new MongoClient(MONGO_URI);
let tasksCollection;
let usersCollection;

async function ensureCollection(db, name) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name);
    console.log(`✅ collection created: ${name}`);
  } else {
    console.log(`ℹ️ collection exists: ${name}`);
  }
}

async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.log('ℹ️ ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin seed');
    return;
  }

  const existing = await usersCollection.findOne({ email });
  if (existing) {
    console.log('ℹ️ admin user exists');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await usersCollection.insertOne({
    email,
    passwordHash,
    role: 'admin',
    createdAt: new Date(),
  });

  console.log('✅ admin user created:', email);
}

async function connectDB() {
  try {
    console.log('🧩 DB_NAME:', DB_NAME);
    console.log('🧩 TASKS_COLLECTION:', TASKS_COLLECTION);
    console.log('🧩 USERS_COLLECTION:', USERS_COLLECTION);
    console.log('🧩 MONGO_URI type:', MONGO_URI.startsWith('mongodb+srv://') ? 'Atlas' : 'Local');

    await client.connect();

    const hello = await client.db('admin').command({ hello: 1 });
    console.log('✅ CONNECTED TO:', hello.me || hello.primary || '(unknown host)');

    const db = client.db(DB_NAME);

    await ensureCollection(db, TASKS_COLLECTION);
    await ensureCollection(db, USERS_COLLECTION);

    tasksCollection = db.collection(TASKS_COLLECTION);
    usersCollection = db.collection(USERS_COLLECTION);

    await ensureAdminUser();

    console.log('✅ database ready');
  } catch (err) {
    console.error('❌ mongodb connection error:', err);
    process.exit(1);
  }
}
connectDB();

// ===== MIDDLEWARE =====
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// sessions
app.set('trust proxy', 1);

app.use(
  session({
    name: 'sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // REQUIRED
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

// logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ===== PAGES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/tasks', (req, res) => res.sendFile(path.join(__dirname, 'views', 'tasks.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'views', 'contact.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));

app.post('/contact', (req, res) => {
  res.send('Message received (demo).');
});

// ===== HELPERS =====
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function toClientTask(t) {
  return { ...t, _id: t._id.toString() };
}

// ✅ New schema: title, details, status, priority, category, deadline
function validateTaskInput(body) {
  const errors = [];

  const title = (body?.title ?? '').toString().trim();
  const details = (body?.details ?? '').toString().trim();

  let status = (body?.status ?? 'todo').toString().trim().toLowerCase();
  status = status.replace(/\s+/g, ''); // "in progress" -> "inprogress"

  let priority = (body?.priority ?? 'medium').toString().trim().toLowerCase();
  let category = (body?.category ?? 'general').toString().trim();

  const deadlineRaw = (body?.deadline ?? '').toString().trim();

  const allowedStatus = new Set(['todo', 'inprogress', 'done']);
  const allowedPriority = new Set(['low', 'medium', 'high']);

  if (!title || title.length < 2 || title.length > 100) errors.push('title must be 2-100 chars');
  if (!details || details.length < 2 || details.length > 500) errors.push('details must be 2-500 chars');
  if (!allowedStatus.has(status)) errors.push('status must be todo|inprogress|done');

  // priority/category: meaningful; if wrong -> default
  if (!allowedPriority.has(priority)) priority = 'medium';
  if (!category || category.length < 2 || category.length > 40) category = 'general';

  // deadline optional; if provided must be valid date and >= today
  let deadline = null;
  if (deadlineRaw) {
    const d = new Date(deadlineRaw);
    if (isNaN(d.getTime())) {
      errors.push('deadline must be a valid date');
    } else {
      const now = new Date();

      // today at 00:00
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // deadline at 00:00
      const dlStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      if (dlStart < todayStart) {
        errors.push('deadline cannot be in the past');
      } else {
        deadline = d;
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    cleaned: { title, details, status, priority, category, deadline },
  };
}


// ===== AUTH =====
function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// ===== AUTH ROUTES =====

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const email = (req.body?.email ?? '').toString().trim().toLowerCase();
    const password = (req.body?.password ?? '').toString();

    if (!email || !password) {
      return res.status(400).json({ error: 'invalid credentials' });
    }

    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    req.session.userId = user._id.toString();
    req.session.role = user.role || 'user';

    // IMPORTANT: save session before responding (fixes flicker)
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'server error' });
      return res.json({ message: 'ok' });
    });
  } catch {
    return res.status(500).json({ error: 'server error' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ message: 'logged out' });
  });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  res.json({
    authenticated: !!req.session?.userId,
    role: req.session?.role || null,
  });
});

// ================= TASKS API =================

// GET all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const { title, sort } = req.query;

    const filter = title
      ? { title: { $regex: `^${escapeRegex(title)}$`, $options: 'i' } }
      : {};

    let sortObj = {};
    if (sort) {
      sortObj[sort.startsWith('-') ? sort.slice(1) : sort] = sort.startsWith('-') ? -1 : 1;
    }

    const tasks = await tasksCollection.find(filter).sort(sortObj).toArray();
    res.status(200).json(tasks.map(toClientTask));
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// GET task by id
app.get('/api/tasks/:id', async (req, res) => {
  const id = req.params.id.trim();
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
    if (!task) return res.status(404).json({ error: 'task not found' });
    res.json(toClientTask(task));
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// CREATE task (PROTECTED)
app.post('/api/tasks', requireAuth, async (req, res) => {
  const v = validateTaskInput(req.body);
  if (!v.ok) return res.status(400).json({ error: 'validation error', details: v.errors });

  try {
    const now = new Date();

    const result = await tasksCollection.insertOne({
      title: v.cleaned.title,
      details: v.cleaned.details,
      status: v.cleaned.status,
      priority: v.cleaned.priority,
      category: v.cleaned.category,
      deadline: v.cleaned.deadline, // Date or null
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ id: result.insertedId.toString() });
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// UPDATE task (PROTECTED)
app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  const id = req.params.id.trim();
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  const v = validateTaskInput(req.body);
  if (!v.ok) return res.status(400).json({ error: 'validation error', details: v.errors });

  try {
    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          title: v.cleaned.title,
          details: v.cleaned.details,
          status: v.cleaned.status,
          priority: v.cleaned.priority,
          category: v.cleaned.category,
          deadline: v.cleaned.deadline,
          updatedAt: new Date(),
        },
      }
    );

    if (!result.matchedCount) return res.status(404).json({ error: 'task not found' });
    res.json({ message: 'updated' });
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// DELETE task (PROTECTED)
app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const id = req.params.id.trim();
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return res.status(404).json({ error: 'task not found' });
    res.json({ message: 'deleted' });
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// INFO
app.get('/api/info', (req, res) => {
  res.json({
    project: 'TaskBoard',
    version: '4.2',
    database: DB_NAME,
    tasksCollection: TASKS_COLLECTION,
    usersCollection: USERS_COLLECTION,
  });
});

// compatibility for old frontend that calls /auth/me
app.get('/auth/me', (req, res) => {
  res.json({
    authenticated: !!req.session?.userId,
    role: req.session?.role || null,
  });
});

// optional: compatibility logout/login if где-то осталось
app.post('/auth/login', (req, res) => res.status(410).json({ error: 'use /api/auth/login' }));
app.post('/auth/logout', (req, res) => res.status(410).json({ error: 'use /api/auth/logout' }));

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api')) res.status(404).json({ error: 'api endpoint not found' });
  else res.status(404).send('404 — page not found');
});

// start
app.listen(PORT, () => {
  console.log(`Server running at: http://localhost:${PORT}`);
});
