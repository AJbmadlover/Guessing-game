const sessions = {}; // in-memory sessions
const playersDetails = {}; 

// ------------------------
// Broadcast current session state
// ------------------------
function broadcastSessionState(io, sessionId) {
  const session = sessions[sessionId];
  const players = playersDetails[sessionId] || [];

  if (!session) {
    io.to(sessionId).emit('session:not_found', { sessionId });
    return;
  }

  const connectedPlayers = players.filter(p => p.connected);

  io.to(sessionId).emit('session:state', {
    sessionId,
    masterId: session.masterId,
    masterName: players.find(p => p.role === 'master')?.name || null,
    players, // full list including disconnected
    connectedPlayers,
    connectedPlayersCount: connectedPlayers.length,
    inProgress: session.inProgress,
    hasActiveQuestion: !!session.currentQuestion,
    questionText: session.currentQuestion?.questionText || null,
    questionDuration: session.currentQuestion?.duration || null
  });
}

// ------------------------
// Assign next master
// ------------------------
function assignNextMaster(io, sessionId, winnerPlayerId = null) {
  const session = sessions[sessionId];
  if (!session) return;
  const players = playersDetails[sessionId];
  const connectedPlayers = players.filter(p => p.connected);
  if (!connectedPlayers.length) return;

  let nextMaster;

  if (winnerPlayerId) {
    // Make winner the next master if they're connected
    nextMaster = connectedPlayers.find(p => p.id === winnerPlayerId) || connectedPlayers[0];
  } else {
    // Rotate to next player
    const currentMasterIndex = connectedPlayers.findIndex(p => p.role === 'master');
    const nextMasterIndex = (currentMasterIndex + 1) % connectedPlayers.length;
    nextMaster = connectedPlayers[nextMasterIndex];
  }

  // Reset roles
  players.forEach(p => p.role = 'player');

  nextMaster.role = 'master';
  session.masterId = nextMaster.id;

  io.to(sessionId).emit('master:changed', { newMaster: nextMaster.name, players });
  players.forEach(p => {
    io.to(p.id).emit("role:assigned", { role: p.role });
  });

  broadcastSessionState(io, sessionId);
}
// ------------------------
// Await master TimeOut 
// ------------------------
function startAwaitingMasterTimeout(io, sessionId, timeoutMs = 60000) { //wait for 1 minute 
  const session = sessions[sessionId];
  if (!session) return;

  // Clear previous timeout if any
  if (session.awaitTimeout) clearTimeout(session.awaitTimeout);

  session.awaitTimeout = setTimeout(() => {
    const players = playersDetails[sessionId] || [];
    const currentMaster = players.find(p => p.role === 'master');

    const stillConnected = currentMaster?.connected;

    if (!stillConnected) {
      io.to(sessionId).emit("round:skipped_master", {
        message: `Master (${currentMaster?.name}) is inactive. Rotating master...`
      });

      assignNextMaster(io, sessionId, null);

      io.to(sessionId).emit("round:awaiting_question", {
        nextMaster: players.find(p => p.role === "master")?.name
      });
    } else {
      io.to(sessionId).emit("round:timeout_warning", {
        message: `Master inactive. Passing turn...`
      });

      assignNextMaster(io, sessionId, null);

      io.to(sessionId).emit("round:awaiting_question", {
        nextMaster: players.find(p => p.role === "master")?.name
      });
    }

  }, timeoutMs);
}

// ------------------------
// Compute session winner
// ------------------------
function computeSessionWinner(players) {
  if (!players.length) return null;
  const maxScore = Math.max(...players.map(p => p.score));
  const winners = players.filter(p => p.score === maxScore);
  return winners.length === 1 ? winners[0].name : null;
}

// ------------------------
// End session
// ------------------------
function endSession(io, sessionId) {
  const session = sessions[sessionId];
  if (!session) return;

  const players = playersDetails[sessionId] || [];
  const overallWinner = computeSessionWinner(players);

  io.to(sessionId).emit('game:ended', { players, winner: overallWinner });
  session.inProgress = false;
  delete sessions[sessionId];
  delete playersDetails[sessionId];

  io.to(sessionId).emit('session:deleted', { sessionId });
}

// ------------------------
// Start question
// ------------------------
function startQuestion(io, sessionId) {
  const session = sessions[sessionId];
  const players = playersDetails[sessionId];
  const question = session?.currentQuestion;

  if (!session || !players || !question) return; // defensive

  // clear any existing timer
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  // Reset round states
  players.forEach(p => {
    p.attemptsLeft = 3;
    p.guessedCorrectly = false;
  });

  session.winner = null;
  session.questionEnded = false;

  io.to(sessionId).emit('game:question', {
    question: question.questionText,
    duration: question.duration,
    players
  });

  broadcastSessionState(io, sessionId);

  // Timer
  session.timer = setTimeout(() => {
    endCurrentQuestion(io, sessionId, null);
  }, question.duration * 1000);
}

// ------------------------
// Handle next question out of a set of questions
// ------------------------

function endCurrentQuestion(io, sessionId, winnerPlayer = null) {
  const session = sessions[sessionId];
  if (!session) return;

  const players = playersDetails[sessionId];
  const question = session?.currentQuestion;

  if (!session || !players) return;
  if (session.questionEnded) return;

  // clear timer if any
  if (session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }

  session.questionEnded = true;

  io.to(sessionId).emit('question:ended', {
    winner: winnerPlayer?.name || null,
    answer: question?.answer || null,
    players,
    message: winnerPlayer ? `${winnerPlayer.name} won this round!` : "Time out! No winner this round."
  });
  

  broadcastSessionState(io, sessionId);

  // assign next master based on winner
    assignNextMaster(io, sessionId, winnerPlayer?.id);

    // clear active question
    session.currentQuestion = null;
    session.inProgress = false;

    // notify master to add next question
  io.to(sessionId).emit('round:awaiting_question', {
    nextMaster: winnerPlayer?.name || "No winner — master rotated",
    message: "Waiting for next master to submit the next question."
  });
  // start inactivity timeout
startAwaitingMasterTimeout(io, sessionId, 60000); // 1 minute

}

// ------------------------
// Handle real disconnect
// ------------------------
function handleRealDisconnect(io, socketId) {
  Object.entries(playersDetails).forEach(([sessionId, sessionObj]) => {
    const playerIndex = sessionObj.findIndex(p => p.id === socketId);
    if (playerIndex !== -1) {
      sessionObj[playerIndex].connected = false;

      const session = sessions[sessionId];
      if (session && session.masterId === socketId) {
        const next = sessionObj.find(p => p.connected);
        if (next) {
          session.masterId = next.id;
          sessionObj.forEach(p => p.role = 'player');
          next.role = 'master';
          io.to(sessionId).emit('master:changed', { newMaster: next.name, players: sessionObj });
        } else {
          session.masterId = null;
        }
      }

      const someoneLeft = sessionObj.some(p => p.connected);
      if (!someoneLeft) {
        delete playersDetails[sessionId];
        delete sessions[sessionId];
      }
    }
  });
}

// ------------------------
// Find player by userId
// ------------------------
function findPlayerByUserId(userId) {
  for (const [sessionId, sessionObj] of Object.entries(playersDetails)) {
    const player = sessionObj.find(p => p.userId === userId);
    if (player) return { sessionId, player };
  }
  return null;
}

// ------------------------
// Socket Handler
// ------------------------
function socketHandler(io) {
  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    // ------------------------
    // Player rejoin
    // ------------------------
    socket.on("player_rejoined", ({ userId, sessionId }) => {
      const sessionObj = playersDetails[sessionId];
      if (!sessionObj) return;

      const player = sessionObj.find(p => p.userId === userId);
      if (player) {
        player.id = socket.id;
        player.connected = true;
        socket.userId = userId;
      }

      socket.emit("reconnect:success", { 
        message: `Player: ${player.name} reconnected and restored`,
        userId,
        sessionId
      });
      
      broadcastSessionState(io, sessionId);
    });

    // ------------------------
    // Create session
    // ------------------------
    socket.on('create_session', ({ sessionId, userName, userId }) => {
      socket.userId = userId;

      sessions[sessionId] = {
        masterId: socket.id,
        inProgress: false,
        questions: [],
        currentQuestionIndex: 0,
        timer: null,
        winner: null,
        startTime: new Date(),
        questionDuration: 60,
        awaitTimeout: null,
      };

      playersDetails[sessionId] = [{
        userId,
        sessionId,
        id: socket.id,
        name: userName,
        score: 0,
        attemptsLeft: 3,
        connected: true,
        guessedCorrectly: false,
        role: 'master'
      }];

      socket.join(sessionId);

      io.to(sessionId).emit('session_created', {
        text: `Session created by ${userName}`,
        sessionId,
        timestamp: Date.now()
      });

      
      io.to(socket.id).emit('role:assigned', { role: 'master' });
      broadcastSessionState(io, sessionId);
    });

    // ------------------------
    // Join session
    // ------------------------
    socket.on('join_session', ({ sessionId, userName, userId }) => {
        const session = sessions[sessionId];
        if (!session) {
          socket.emit('message:error', { type: 'system', text: 'Session not found.', timestamp: new Date() });
          return;
        }
        if (session.inProgress) {
          socket.emit('message:error', { type: 'system', text: 'Game in progress, cannot join.', timestamp: new Date() });
          return;
        }

        socket.userId = userId;

        // Check if this userId already exists (reconnection)
        const existingPlayer = playersDetails[sessionId]?.find(p => p.userId === userId);
        if (existingPlayer) {
          existingPlayer.id = socket.id;
          existingPlayer.connected = true;
          socket.join(sessionId);

          // Notify only the reconnecting player
          // ✅ re-emit role to the new socket
          socket.emit('role:assigned', { role: existingPlayer.role });
          socket.emit('message:success', { type: 'system', text: `Welcome ${existingPlayer.name}!`, sessionId:sessionId });
          broadcastSessionState(io, sessionId);
          return;
        }

        // New player join
        const newPlayer = {
          userId,
          sessionId,
          id: socket.id,
          name: userName,
          score: 0,
          attemptsLeft: 3,
          connected: true,
          guessedCorrectly: false,
          role: 'player'
        };

        playersDetails[sessionId].push(newPlayer);
        socket.join(sessionId);

        // Notify **other players** only
        socket.to(sessionId).emit('message:new', {
          type: 'system',
          text: `${userName} joined the session.`,
          timestamp: new Date()
        });

        // Notify the joining player only
        socket.emit('message:success', { type: 'system', text: `You joined ${sessionId}.` });

        
        socket.emit('role:assigned', { role: 'player' });
        
        broadcastSessionState(io, sessionId);
      });


    // ------------------------
    // Add questions
    // ------------------------
    socket.on('start_question', ({ sessionId, question }) => {
      const players = playersDetails[sessionId];
      if (!players) return;
      // Find the current master from session
        const session = sessions[sessionId];
        if (session.awaitTimeout) {
          clearTimeout(session.awaitTimeout);
          session.awaitTimeout = null;
        }
        const currentMaster = players.find(p => p.role === 'master');

        if (!currentMaster || currentMaster.userId !== socket.userId) {
          socket.emit('message:error', { text: 'Only the current master can add questions.' });
          return;
        }

        const qObj = Array.isArray(question) ? question[0] : question;
        if (!qObj || !qObj.questionText || !qObj.answer) {
          socket.emit('message:error', { text: 'Invalid question payload.' });
          return;
        }

        if (session.timer) {
          clearTimeout(session.timer);
          session.timer = null;
        }

      session.currentQuestion = {
        questionText: qObj.questionText,
        answer: qObj.answer,
        duration: qObj.duration || session.questionDuration || 60
      };

      session.inProgress = true;
      session.winner = null;
      session.questionEnded = false;

      io.to(sessionId).emit('message:new', {
        type: 'system',
        text: `Master added a question.`,
        timestamp: new Date()
      });

      startQuestion(io, sessionId);
      broadcastSessionState(io, sessionId);
    });

    // ------------------------
    // Start game
    // ------------------------
    socket.on('start_game', ({ sessionId }) => {
      const session = sessions[sessionId];
      const players = playersDetails[sessionId];
      if (!session || !players || session.inProgress) return;

      if (players.filter(p => p.connected).length < 3) {
        socket.emit('message:new', { type: 'system', text: 'Need at least 1 master and 2 players to start.', timestamp: new Date() });
        return;
      }
      // game starts but waits for master to submit the first question
      session.inProgress = false;
      session.currentQuestion = null;
      session.winner = null;
      session.questionEnded = false;

      io.to(sessionId).emit('message:new', {
        type: 'system',
        text: 'Game started. Waiting for Master to submit a question.',
        timestamp: new Date()
      });

      console.log("Questions:", sessions[sessionId].questions);

      broadcastSessionState(io, sessionId);
      // startQuestion(io, sessionId);
    });

    // ------------------------
    // Submit guess
    // ------------------------
    socket.on('submit_guess', ({ sessionId, guess }) => {
      const session = sessions[sessionId];
      const players = playersDetails[sessionId];
      if (!session || !players || !session.inProgress) return;

      const player = players.find(p => p.id === socket.id);
      if (!player || player.attemptsLeft <= 0 || session.winner) return;

     const currentQuestion = session.currentQuestion;

      if (!currentQuestion) return;

      if (guess.trim().toLowerCase() === currentQuestion.answer.toLowerCase()) {
        player.score += 10;
        player.guessedCorrectly = true;
        session.winner = player.name;
        clearTimeout(session.timer);

        endCurrentQuestion(io, sessionId, player);
      } else {
        player.attemptsLeft--;
        socket.emit('guess:result', { correct: false, attemptsLeft: player.attemptsLeft });
        broadcastSessionState(io, sessionId);
      }
    });

    // ------------------------
    // Chat handler
    // ------------------------
    socket.on('chat:send', ({ sessionId, message }) => {
      if (!sessionId || !message) return;
      const { player } = findPlayerByUserId(socket.userId) || {};
      const userName = player?.name || "Unknown";

      const chatData = { user: userName, message, timestamp: new Date() };
      io.to(sessionId).emit('chat:new', chatData);
    });

    // ------------------------
    // Disconnect
    // ------------------------
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id} (reason: ${reason})`);

      if (reason === "transport close" || reason === "ping timeout") {
        setTimeout(() => {
          if (io.sockets.sockets.get(socket.id)) return;
          handleRealDisconnect(io, socket.id);
        }, 3000);
        return;
      }

      handleRealDisconnect(io, socket.id);
    });
  });
}

module.exports = socketHandler;

