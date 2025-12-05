const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  score: { type: Number, default: 0 }
});

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  players: [playerSchema],
  winner: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, expires: 3*24*60*60 } // 3 days TTL
});

module.exports = mongoose.model('Session', sessionSchema);
