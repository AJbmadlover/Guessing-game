const User = require('./models/user');
const sessionController = require('./controllers/sessionController');

const sessions = {}; // in-memory sessions

// Send next question
function sendNextQuestion(io, sessionId) {
  const session = sessions[sessionId];
  if (!session) return;

  if (session.currentQuestionIndex >= session.questions.length) {
    endSession(io, sessionId);
    return;
  }

  const question = session.questions[session.currentQuestionIndex];

  // Reset attempts & guessedCorrectly
  session.players.forEach(p => {
    p.attemptsLeft = 3;
    p.guessedCorrectly = false;
  });
  session.winner = null;

  io.to(sessionId).emit('game:question', {
    question: question.questionText,
    questionIndex: session.currentQuestionIndex + 1,
    totalQuestions: session.questions.length,
    players: session.players
  });

  // Start per-question timer
  session.timer = setTimeout(() => {
    io.to(sessionId).emit('question:ended', {
      winner: null,
      answer: question.answer,
      players: session.players,
      message: "Time out! No winner this round."
    });

    session.players.forEach(p => p.attemptsLeft = 0);

    session.currentQuestionIndex += 1;
    setTimeout(() => sendNextQuestion(io, sessionId), 4000);

  }, (question.duration || session.questionDuration) * 1000);
}

// Compute overall session winner
function computeSessionWinner(players) {
  if (!players.length) return null;
  const maxScore = Math.max(...players.map(p => p.score));
  const winners = players.filter(p => p.score === maxScore);
  return winners.length === 1 ? winners[0].name : null; // tie -> null
}

// End session
async function endSession(io, sessionId) {
  const session = sessions[sessionId];
  if (!session) return;

  const overallWinner = computeSessionWinner(session.players);

  io.to(sessionId).emit('game:ended', {
    players: session.players,
    winner: overallWinner
  });

  await sessionController.saveSessionSnapshotFromSocket({
    id: sessionId,
    players: session.players,
    winner: overallWinner,
    questions: session.questions,
    startTime: session.startTime,
    endTime: new Date()
  });

  delete sessions[sessionId];
}

// Socket handler
function socketHandler(io) {
  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // ------------------------
    // Create session
    // ------------------------
    socket.on('create_session', async ({ sessionId, masterName }) => {
      const durationMs = 60000; // default 60s
      let user = await User.findOne({ name: masterName });
      if (!user) user = await User.create({ name: masterName });

      sessions[sessionId] = {
        masterId: socket.id,
        players: [{
          id: socket.id,
          name: masterName,
          // score: 0,
          // attemptsLeft: 3,
          connected: true,
          // guessedCorrectly: false,
          role: 'master'
        }],
        inProgress: false,
        questions: [],
        currentQuestionIndex: 0,
        timer: null,
        winner: null,
        startTime: new Date(),
        questionDuration: durationMs / 1000
      };


      socket.join(sessionId);

      // Sticky session created message
      io.to(sessionId).emit('session:created', {
        text: `${masterName} created the session.`,
        timestamp: new Date()
      });

      // Notify the creator of their role
      io.to(socket.id).emit('role:assigned', { role: 'master' });

    });

    // ------------------------
    // Join session
    // ------------------------
    socket.on('join_session', async ({ sessionId, userName }) => {
      const session = sessions[sessionId];
      if (!session) {
        socket.emit('message:new', { type: 'system', text: 'Session not found.', timestamp: new Date() });
        return;
      }
      if (session.inProgress) {
        socket.emit('message:new', { type: 'system', text: 'Game in progress, cannot join.', timestamp: new Date() });
        return;
      }

      let user = await User.findOne({ name: userName });
      if (!user) user = await User.create({ name: userName });

      session.players.push({
        id: socket.id,
        name: userName,
        score: 0,
        attemptsLeft: 3,
        connected: true,
        guessedCorrectly: false,
        role: 'player'
      });
      socket.join(sessionId);

      io.to(sessionId).emit('message:new', {
        type: 'system',
        text: `${userName} joined the session.`,
        timestamp: new Date()
      });

      // Notify the player of their role
      io.to(socket.id).emit('role:assigned', { role: 'player' });
    });

    

    // ------------------------
    // Add questions
    // ------------------------
    socket.on('add_questions', ({ sessionId, questions }) => {
      const session = sessions[sessionId];
      if (!session || socket.id !== session.masterId) return;

      session.questions = questions.map(q => ({
        questionText: q.questionText,
        answer: q.answer,
        duration: q.duration || 60
      }));

      io.to(sessionId).emit('message:new', {
        type: 'system',
        text: `${questions.length} questions added by master.`,
        timestamp: new Date()
      });
    });

    // ------------------------
    // Start game
    // ------------------------
    socket.on('start_game', ({ sessionId }) => {
      const session = sessions[sessionId];
      if (!session || session.inProgress) return;
      if (session.players.length < 2) {
        socket.emit('message:new', { type: 'system', text: 'Need at least 2 players to start.', timestamp: new Date() });
        return;
      }

      session.inProgress = true;
      session.currentQuestionIndex = 0;
      sendNextQuestion(io, sessionId);
    });

    // ------------------------
    // Submit guess
    // ------------------------
    socket.on('submit_guess', ({ sessionId, guess }) => {
      const session = sessions[sessionId];
      if (!session || !session.inProgress) return;

      const player = session.players.find(p => p.id === socket.id);
      if (!player || player.attemptsLeft <= 0) return;

      const currentQuestion = session.questions[session.currentQuestionIndex];
      if (!currentQuestion) return;

      if (guess.toLowerCase() === currentQuestion.answer.toLowerCase()) {
        player.score += 10;
        player.guessedCorrectly = true;
        session.winner = player.name;

        clearTimeout(session.timer);

        io.to(sessionId).emit('question:ended', {
          winner: player.name,
          answer: currentQuestion.answer,
          players: session.players
        });

        session.currentQuestionIndex += 1;
        setTimeout(() => sendNextQuestion(io, sessionId), 4000);
      } else {
        player.attemptsLeft -= 1;
        socket.emit('guess:result', {
          correct: false,
          attemptsLeft: player.attemptsLeft
        });
      }
    });

    // ------------------------
    // Disconnect
    // ------------------------
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      Object.entries(sessions).forEach(([sessionId, session]) => {
        const playerIndex = session.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          session.players[playerIndex].connected = false;

          // Reassign master if master left
          if (socket.id === session.masterId) {
            const remaining = session.players.find(p => p.connected);
            session.masterId = remaining ? remaining.id : null;
          }

          // Delete session if all players disconnected
          if (!session.players.some(p => p.connected)) {
            delete sessions[sessionId];
          }
        }
      });
    });
    let gameData = {};
    gameData = sessions;
    console.log(gameData);
    socket.emit("UserDetails", gameData)
  });
}

module.exports = socketHandler;
