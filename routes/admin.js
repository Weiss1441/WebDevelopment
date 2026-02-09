const express = require('express');
const { ObjectId } = require('mongodb');
const { getCollections } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');

const router = express.Router();

function toClientTask(t) {
  return { ...t, _id: t._id.toString() };
}

// Admin: view all tasks (optional filter/sort too)
router.get('/tasks', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { tasksCollection } = getCollections();
    const tasks = await tasksCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(tasks.map(toClientTask));
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// Admin: update any task by id
router.put('/tasks/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { tasksCollection } = getCollections();

    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
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
    res.json({ message: 'updated by admin' });
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

// Admin: delete any task by id
router.delete('/tasks/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { tasksCollection } = getCollections();
    const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });

    if (!result.deletedCount) return res.status(404).json({ error: 'task not found' });
    res.json({ message: 'deleted by admin' });
  } catch {
    res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
