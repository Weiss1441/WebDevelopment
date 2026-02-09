const express = require('express');
const { ObjectId } = require('mongodb');
const { getCollections } = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toClientTask(t) {
  return { ...t, _id: t._id.toString() };
}

// GET tasks (only own)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { tasksCollection } = getCollections();
    const { title, sort } = req.query;

    const filter = { userId: req.session.userId };

    if (title) {
      filter.title = { $regex: `^${escapeRegex(title)}$`, $options: 'i' };
    }

    let sortObj = {};
    if (sort) {
      sortObj[sort.startsWith('-') ? sort.slice(1) : sort] = sort.startsWith('-') ? -1 : 1;
    }

    const tasks = await tasksCollection.find(filter).sort(sortObj).toArray();
    res.json(tasks.map(toClientTask));
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// CREATE
router.post('/', requireAuth, async (req, res) => {
  try {
    const { tasksCollection } = getCollections();
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
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// UPDATE
router.put('/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { tasksCollection } = getCollections();

    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id), userId: req.session.userId },
      {
        $set: {
          title: req.body.title,
          details: req.body.details,
          status: req.body.status,
          priority: req.body.priority,
          category: req.body.category,
          deadline: req.body.deadline ? new Date(req.body.deadline) : null,
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

// DELETE
router.delete('/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { tasksCollection } = getCollections();

    const result = await tasksCollection.deleteOne({
      _id: new ObjectId(id),
      userId: req.session.userId,
    });

    if (!result.deletedCount) return res.status(404).json({ error: 'task not found' });
    res.json({ message: 'deleted' });
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
