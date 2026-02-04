const express = require('express');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

require('dotenv').config({ override: true });

const app = express();

// ===== ENV =====
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'taskboard_db';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'tasks';

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is missing in .env');
  process.exit(1);
}

// ===== DB =====
const client = new MongoClient(MONGO_URI);
let tasksCollection;

async function ensureCollection(db, name) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name);
    console.log(`✅ collection created: ${name}`);
  } else {
    console.log(`ℹ️ collection exists: ${name}`);
  }
}

async function connectDB() {
  try {
    console.log('🧩 DB_NAME:', DB_NAME);
    console.log('🧩 COLLECTION_NAME:', COLLECTION_NAME);
    console.log('🧩 MONGO_URI type:', MONGO_URI.startsWith('mongodb+srv://') ? 'Atlas' : 'Local');

    await client.connect();

    const hello = await client.db('admin').command({ hello: 1 });
    console.log('✅ CONNECTED TO:', hello.me || hello.primary || '(unknown host)');

    const db = client.db(DB_NAME);
    await ensureCollection(db, COLLECTION_NAME);

    tasksCollection = db.collection(COLLECTION_NAME);
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

// logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// ===== PAGES =====
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/tasks', (req, res) => res.sendFile(path.join(__dirname, 'views', 'tasks.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'views', 'contact.html')));

app.post('/contact', (req, res) => {
  res.send('Message received (demo).');
});

// ===== HELPERS =====
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function toClientTask(t) {
  return { ...t, _id: t._id.toString() };
}

// ================= API =================

// GET all tasks (strict title filter optional)
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

// CREATE task
app.post('/api/tasks', async (req, res) => {
  const { title, details, status } = req.body;

  if (!title || !details) {
    return res.status(400).json({ error: 'missing required fields' });
  }

  try {
    const result = await tasksCollection.insertOne({
      title: title.trim(),
      details,
      status: status || 'todo',
      createdAt: new Date()
    });

    res.status(201).json({ id: result.insertedId.toString() });
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// UPDATE task
app.put('/api/tasks/:id', async (req, res) => {
  const id = req.params.id.trim();
  const { title, details, status } = req.body;

  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });
  if (!title || !details) return res.status(400).json({ error: 'missing required fields' });

  try {
    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { title: title.trim(), details, status: status || 'todo', updatedAt: new Date() } }
    );

    if (!result.matchedCount) return res.status(404).json({ error: 'task not found' });
    res.json({ message: 'updated' });
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// DELETE task
app.delete('/api/tasks/:id', async (req, res) => {
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
    version: '3.2',
    database: DB_NAME,
    collection: COLLECTION_NAME
  });
});

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api')) res.status(404).json({ error: 'api endpoint not found' });
  else res.status(404).send('404 — page not found');
});

// start
app.listen(PORT, () => {
  console.log(`🚀 Server running at: http://localhost:${PORT}`);
});
