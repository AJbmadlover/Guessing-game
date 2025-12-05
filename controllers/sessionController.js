// controllers/sessionController.js
const SessionModel = require('../models/session');
const mongoose = require('mongoose');

// 1️⃣ Save a session snapshot after game ends
exports.saveSessionSnapshotFromSocket = async (session) => {
  try {
    const sessionData = new SessionModel({
      sessionId: session.id,
      players: session.players.map(p => ({ name: p.name, score: p.score })),
      winner: session.winner || null,
      totalQuestions: session.questions.length,
      totalCorrect: session.players.filter(p => p.guessedCorrectly).length,
      startTime: session.startTime,
      endTime: new Date(),
      questions: session.questions.map(q => ({
        questionText: q.questionText,
        answer: q.answer,
        duration: q.duration
      }))
    });
    await sessionData.save();
    console.log(`Session ${session.id} saved to MongoDB`);
  } catch (err) {
    console.error(err);
  }
};


// 2️⃣ Get session history with optional filters
exports.getSessionHistory = async (req, res) => {
  try {
    const { sessionId, winner, from, to } = req.query;

    const query = {};
    if (sessionId) query.sessionId = sessionId;
    if (winner) query.winner = winner;
    if (from || to) query.endTime = {};
    if (from) query.endTime.$gte = new Date(from);
    if (to) query.endTime.$lte = new Date(to);

    const sessions = await SessionModel.find(query).sort({ endTime: -1 });
    res.json({ success: true, sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// 3️⃣ Get specific session details
exports.getSessionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }

    const session = await SessionModel.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// 4️⃣ Delete / cleanup old sessions (older than 5 days)
exports.cleanupOldSessions = async () => {
  try {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const result = await SessionModel.deleteMany({ endTime: { $lt: fiveDaysAgo } });
    console.log(`Cleaned up ${result.deletedCount} old sessions.`);
  } catch (err) {
    console.error('Error cleaning up old sessions:', err);
  }
};

// 5️⃣ Leaderboard: total wins per player
exports.getLeaderboard = async (req, res) => {
  try {
    const leaderboard = await SessionModel.aggregate([
      { $match: { winner: { $ne: null } } },
      { $group: { _id: "$winner", totalWins: { $sum: 1 } } },
      { $sort: { totalWins: -1 } },
      { $limit: 10 }
    ]);
    res.json({ success: true, leaderboard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// 6️⃣ Search / filter sessions by player name, winner name, or date
exports.searchSessions = async (req, res) => {
  try {
    const { playerName, winnerName, from, to } = req.query;
    const query = {};

    if (playerName) query['players.name'] = playerName;
    if (winnerName) query.winner = winnerName;
    if (from || to) query.endTime = {};
    if (from) query.endTime.$gte = new Date(from);
    if (to) query.endTime.$lte = new Date(to);

    const sessions = await SessionModel.find(query).sort({ endTime: -1 });
    res.json({ success: true, sessions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
