const express = require('express');
const { ObjectId } = require('mongodb');
const { getCollections } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/requireAuth');

const router = express.Router();
console.log('ADMIN ROUTES FILE LOADED:', __filename);

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toClientTask(t) {
  return { ...t, _id: t._id.toString() };
}

function parsePagination(q) {
  const hasPaging = q.page !== undefined || q.limit !== undefined;

  const pageRaw = parseInt(q.page, 10);
  const limitRaw = parseInt(q.limit, 10);

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  let limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;

  if (limit > 50) limit = 50;

  const skip = (page - 1) * limit;

  return { hasPaging, page, limit, skip };
}

router.get('/tasks', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { tasksCollection } = getCollections();
    const { title, sort } = req.query;

    const { hasPaging, page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (title) filter.title = { $regex: `^${escapeRegex(title)}$`, $options: 'i' };

    let sortObj = { createdAt: -1 };
    if (sort) {
      sortObj = {};
      sortObj[sort.startsWith('-') ? sort.slice(1) : sort] = sort.startsWith('-') ? -1 : 1;
    }

    if (!hasPaging) {
      const tasks = await tasksCollection.find(filter).sort(sortObj).toArray();
      return res.json(tasks.map(toClientTask));
    }

    const total = await tasksCollection.countDocuments(filter);

    const tasks = await tasksCollection
      .find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .toArray();

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      items: tasks.map(toClientTask),
      page,
      limit,
      total,
      totalPages,
    });
  } catch {
    return res.status(500).json({ error: 'database error' });
  }
});

// ✅ FIX: admin can create tasks (UI sends POST /api/admin/tasks)
router.post('/tasks', requireAuth, requireAdmin, async (req, res) => {
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

    return res.status(201).json({ id: result.insertedId.toString() });
  } catch {
    return res.status(500).json({ error: 'database error' });
  }
});

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
    return res.json({ message: 'updated by admin' });
  } catch {
    return res.status(500).json({ error: 'database error' });
  }
});

router.delete('/tasks/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const { tasksCollection } = getCollections();
    const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });

    if (!result.deletedCount) return res.status(404).json({ error: 'task not found' });
    return res.json({ message: 'deleted by admin' });
  } catch {
    return res.status(500).json({ error: 'database error' });
  }
});

module.exports = router;
