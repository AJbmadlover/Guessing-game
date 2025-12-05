const express = require('express');
const router = express.Router();

const {createUser,getUserStats, updateDisplayName, getLeaderboard, searchUsers} = require('../controllers/userController');

// Create or get user
router.post('/', createUser);

// Get user stats
router.get('/:id/stats', getUserStats);

// Update display name
router.put('/:id/name', updateDisplayName);

router.get("/leaderboard", getLeaderboard);

router.get("/search",searchUsers);

module.exports = router;    