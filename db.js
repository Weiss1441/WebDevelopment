const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'taskboard_db';
const TASKS_COLLECTION = process.env.TASKS_COLLECTION || 'tasks';
const USERS_COLLECTION = process.env.USERS_COLLECTION || 'users';

const client = new MongoClient(MONGO_URI);

let tasksCollection;
let usersCollection;

async function connectDB() {
  await client.connect();
  const db = client.db(DB_NAME);

  tasksCollection = db.collection(TASKS_COLLECTION);
  usersCollection = db.collection(USERS_COLLECTION);

  await tasksCollection.createIndex({ userId: 1, createdAt: -1 });
  await tasksCollection.createIndex({ userId: 1, deadline: 1, createdAt: -1 });
  await usersCollection.createIndex({ email: 1 }, { unique: true });

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
    }
  }

  return { tasksCollection, usersCollection, client };
}

function getCollections() {
  if (!tasksCollection || !usersCollection) {
    throw new Error('DB not connected yet');
  }
  return { tasksCollection, usersCollection };
}

module.exports = { connectDB, getCollections };
