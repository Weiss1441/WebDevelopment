const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config({ override: true });

const { connectDB } = require('./db');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const adminRoutes = require('./routes/admin');

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (!MONGO_URI || !SESSION_SECRET) {
  console.error('ENV ERROR');
  process.exit(1);
}

connectDB()
  .then(() => console.log('DB ready'))
  .catch((e) => {
    console.error('DB error:', e);
    process.exit(1);
  });

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);

app.use(
  session({
    name: 'sid',
    secret: SESSION_SECRET,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      collectionName: process.env.SESSIONS_COLLECTION || 'sessions',
      ttl: 60 * 60 * 24,
      autoRemove: 'native',
    }),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'views/index.html')));
app.get('/login', (_, res) => res.sendFile(path.join(__dirname, 'views/login.html')));
app.get('/register', (_, res) => res.sendFile(path.join(__dirname, 'views/register.html')));
app.get('/tasks', (_, res) => res.sendFile(path.join(__dirname, 'views/tasks.html')));

app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  if (req.path.startsWith('/api')) res.status(404).json({ error: 'api endpoint not found' });
  else res.status(404).send('404 — page not found');
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
