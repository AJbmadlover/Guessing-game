const express = require('express');
const router = express.Router();

const {getSessionHistory, getSessionById, cleanupOldSessions, getLeaderboard, searchSessions} = require('../controllers/sessionController');

// Get session history with optional filters
router.get('/', getSessionHistory);
// Get specific session details
router.get('/:id', getSessionById);

// Additional routes for leaderboard and search
router.get('/leaderboard', getLeaderboard);

router.get('/search', searchSessions);

// Route to cleanup old sessions (could be protected in real app)
router.delete('/cleanup', cleanupOldSessions);

module.exports = router;