const express = require('express');
const bcrypt = require('bcrypt');
const { getCollections } = require('../db');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { usersCollection } = getCollections();

    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    if (!email || password.length < 6) {
      return res.status(400).json({ error: 'invalid input' });
    }

    const exists = await usersCollection.findOne({ email });
    if (exists) return res.status(409).json({ error: 'user exists' });

    const result = await usersCollection.insertOne({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'user',
      createdAt: new Date(),
    });

    req.session.userId = result.insertedId.toString();
    req.session.role = 'user';

    req.session.save(() => res.status(201).json({ message: 'registered' }));
  } catch {
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { usersCollection } = getCollections();

    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';

    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    req.session.userId = user._id.toString();
    req.session.role = user.role || 'user';

    req.session.save(() => res.json({ message: 'ok' }));
  } catch {
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ message: 'logged out' });
  });
});

router.get('/me', (req, res) => {
  res.json({
    authenticated: !!req.session?.userId,
    role: req.session?.role || null,
  });
});

module.exports = router;
