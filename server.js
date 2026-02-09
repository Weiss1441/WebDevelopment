//server.js-FINAL

const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ override: true });

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'taskboard_db';
const TASKS_COLLECTION = process.env.TASKS_COLLECTION || 'tasks';
const USERS_COLLECTION = process.env.USERS_COLLECTION || 'users';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!MONGO_URI || !SESSION_SECRET) {
  console.error('❌ ENV ERROR');
  process.exit(1);
}

const client = new MongoClient(MONGO_URI);
let tasksCollection;
let usersCollection;

async function connectDB() {
  await client.connect();
  const db = client.db(DB_NAME);

  tasksCollection = db.collection(TASKS_COLLECTION);
  usersCollection = db.collection(USERS_COLLECTION);

  await tasksCollection.createIndex({ userId: 1, createdAt: -1 });

  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || '';

  if (adminEmail && adminPass) {
    const exists = await usersCollection.findOne({ email: adminEmail });
    if (!exists) {
      await usersCollection.insertOne({
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPass, 10),
        role: 'admin',
        createdAt: new Date(),
      });
      console.log('✅ admin created');
    }
  }

  console.log('✅ MongoDB connected');
}
connectDB();

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);

app.use(
  session({
    name: 'sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

function requireAuth(req, res, next) {
  if (req.session?.userId) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

function isAdmin(req) {
  return req.session?.role === 'admin';
}

function toClientTask(t) {
  return { ...t, _id: t._id.toString() };
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'views/index.html')));
app.get('/login', (_, res) => res.sendFile(path.join(__dirname, 'views/login.html')));
app.get('/register', (_, res) => res.sendFile(path.join(__dirname, 'views/register.html')));
app.get('/tasks', (_, res) => res.sendFile(path.join(__dirname, 'views/tasks.html')));
app.get('/contact', (_, res) => res.sendFile(path.join(__dirname, 'views/contact.html')));

app.post('/api/auth/register', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || password.length < 6)
    return res.status(400).json({ error: 'invalid input' });

  if (await usersCollection.findOne({ email }))
    return res.status(409).json({ error: 'user exists' });

  const result = await usersCollection.insertOne({
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'user',
    createdAt: new Date(),
  });

  req.session.userId = result.insertedId.toString();
  req.session.role = 'user';
  req.session.save(() => res.status(201).json({ message: 'registered' }));
});

app.post('/api/auth/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  const user = await usersCollection.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: 'invalid credentials' });

  req.session.userId = user._id.toString();
  req.session.role = user.role;
  req.session.save(() => res.json({ message: 'ok' }));
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ message: 'logged out' });
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({
    authenticated: !!req.session?.userId,
    role: req.session?.role || null,
  });
});

// GET tasks (only own, admin = all)
app.get('/api/tasks', requireAuth, async (req, res) => {
  const { title, sort } = req.query;

  const filter = isAdmin(req)
    ? {}
    : { userId: req.session.userId };

  if (title)
    filter.title = { $regex: `^${escapeRegex(title)}$`, $options: 'i' };

  let sortObj = {};
  if (sort)
    sortObj[sort.startsWith('-') ? sort.slice(1) : sort] =
      sort.startsWith('-') ? -1 : 1;

  const tasks = await tasksCollection.find(filter).sort(sortObj).toArray();
  res.json(tasks.map(toClientTask));
});

// CREATE
app.post('/api/tasks', requireAuth, async (req, res) => {
  const now = new Date();

  const result = await tasksCollection.insertOne({
    userId: req.session.userId,
    title: req.body.title,
    details: req.body.details,
    status: req.body.status || 'todo',
    priority: req.body.priority || 'medium',
    category: req.body.category || 'general',
    deadline: req.body.deadline ? new Date(req.body.deadline) : null,
    createdAt: now,
    updatedAt: now,
  });

  res.status(201).json({ id: result.insertedId.toString() });
});

// UPDATE
app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  const filter = {
    _id: new ObjectId(id),
    ...(isAdmin(req) ? {} : { userId: req.session.userId }),
  };

  const result = await tasksCollection.updateOne(filter, {
    $set: {
      title: req.body.title,
      details: req.body.details,
      status: req.body.status,
      priority: req.body.priority,
      category: req.body.category,
      deadline: req.body.deadline ? new Date(req.body.deadline) : null,
      updatedAt: new Date(),
    },
  });

  if (!result.matchedCount)
    return res.status(404).json({ error: 'task not found' });

  res.json({ message: 'updated' });
});

// DELETE
app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  const result = await tasksCollection.deleteOne({
    _id: new ObjectId(id),
    ...(isAdmin(req) ? {} : { userId: req.session.userId }),
  });

  if (!result.deletedCount)
    return res.status(404).json({ error: 'task not found' });

  res.json({ message: 'deleted' });
});

app.listen(PORT, () =>
  console.log(`✅ Server running: http://localhost:${PORT}`)
);
