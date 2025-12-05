// controllers/userController.js
const User = require('../models/user');
const SessionModel = require('../models/session');
const mongoose = require("mongoose")
// Create or get user
exports.createUser = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });


    let user = await User.findOne({ name });
    if (!user){
        user = await User.create({ name });
    }else{
        return res.status(400).json({ error: 'User name already exists' });
    }

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get user stats: total games, total wins, win rate
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const totalGames = await SessionModel.countDocuments({ "players.id": userId });
    const totalWins = await SessionModel.countDocuments({ winner: userId });

    res.json({
      userId,
      totalGames,
      totalWins,
      winRate: totalGames ? (totalWins / totalGames).toFixed(2) : 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update display name (user can only update their own name)
exports.updateDisplayName = async (req, res) => {
  try {
    const userId = req.params.id;
    const { newName } = req.body;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    if (!newName) return res.status(400).json({ error: 'New name is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.name = newName;
    await user.save();

    res.json({ success: true, 
        message: "Name updated successfully",
        user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Leaderboard: top players by win rate
exports.getLeaderboard = async (req, res) => {
  try {
    const users = await User.find();

    const leaderboard = await Promise.all(
      users.map(async user => {
        const totalGames = await SessionModel.countDocuments({ "players.id": user._id });
        const totalWins = await SessionModel.countDocuments({ winner: user._id });

        return {
          name: user.name,
          totalGames,
          totalWins,
          winRate: totalGames ? (totalWins / totalGames).toFixed(2) : 0
        };
      })
    );

    leaderboard.sort((a, b) => b.winRate - a.winRate); // descending
    res.json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Search users by name
exports.searchUsers = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'Name query is required' });

    const users = await User.find({ name: { $regex: name, $options: 'i' } });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
