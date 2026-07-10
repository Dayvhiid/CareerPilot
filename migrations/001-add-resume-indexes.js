module.exports = {
  up: async (db) => {
    await db.collection('resumes').createIndex({ userId: 1 }, { name: 'userId_1' });
    await db.collection('resumes').createIndex({ createdAt: -1 }, { name: 'createdAt_-1' });
  },
  down: async (db) => {
    await db.collection('resumes').dropIndex('userId_1');
    await db.collection('resumes').dropIndex('createdAt_-1');
  }
};
