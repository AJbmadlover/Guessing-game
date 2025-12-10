import { io } from "https://cdn.socket.io/4.8.1/socket.io.esm.min.js";

const socket = io();

socket.on("connect", () => {
  console.log("Connected to server with ID:", socket.id);
});

// ------------------------
// UI Elements
// ------------------------
const sessionIdBanner = document.getElementById("sessionId");
const timerEl = document.getElementById("timer");
const playersListEl = document.getElementById("playersList");
const activeCountEl = document.getElementById("activeCount");
const questionTextEl = document.getElementById("questionText");
const systemMessagesEl = document.getElementById("systemMessages");
const chatMessagesEl = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChat");
const masterControls = document.getElementById("masterControls");
const startQuestionBtn = document.getElementById("startQuestionBtn");
const playerAnswerBox = document.getElementById("playerAnswerBox");
const submitGuessBtn = document.getElementById("submitGuessBtn");
const playerGuessInput = document.getElementById("playerGuessInput");
const attemptsDisplay = document.getElementById("attemptsDisplay");
const questionInput = document.getElementById("questionInput");
const answerInput = document.getElementById("answerInput");
const msgBox = document.getElementById("msgBox");

let sessionId = sessionStorage.getItem("sessionId");
let userId = sessionStorage.getItem("userId");
let userName = sessionStorage.getItem("userName");
let userRole = null;
let timerInterval = null;

// ------------------------
// Helper Functions
// ------------------------
function showMessage(type, text) {
  msgBox.className = type;
  msgBox.textContent = text;
  msgBox.style.display = "block";
  setTimeout(() => (msgBox.style.display = "none"), 3000);
}

function addSystemMessage(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  div.classList.add("systemMsg");
  systemMessagesEl.appendChild(div);
  systemMessagesEl.scrollTop = systemMessagesEl.scrollHeight;
}

function addChatMessage(user, msg) {
  const div = document.createElement("div");
  div.innerHTML = `<strong>${user}:</strong> ${msg}`;
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function renderPlayers(players) {
  playersListEl.innerHTML = "";
  let maxScore = Math.max(...players.map(p => p.score));
  players.forEach(p => {
    const div = document.createElement("div");
    div.classList.add("player");
    if (p.role === "master") div.classList.add("master");
    if (p.score === maxScore && maxScore > 0) div.classList.add("topScore");
    div.textContent = `${p.name} - ${p.score}`;
    playersListEl.appendChild(div);
  });
}

// ------------------------
// Role-based UI
// ------------------------
function applyRoleUI(role) {
  userRole = role;

  if (role === "master") {
    masterControls.style.display = "block";
    startQuestionBtn.style.display = "block";
    playerAnswerBox.style.display = "none";
    questionTextEl.textContent = "You are the Master! Submit a question to start.";
  } else {
    masterControls.style.display = "none";
    startQuestionBtn.style.display = "none";
    playerAnswerBox.style.display = "none"; // show only when question starts
    questionTextEl.textContent = "Waiting for the master to start...";
  }
}

socket.on('message:success', (data) => {
    addSystemMessage(data.text); // e.g., "You joined 6ae20c"
    sessionIdBanner.textContent = `Session ID: ${data.sessionId}`;
  });

  // Messages about others joining
  socket.on('message:new', (data) => {
    addSystemMessage(data.text); // e.g., "JB joined the session"
  });


// ------------------------
// Player Controls
// ------------------------
submitGuessBtn.addEventListener("click", () => {
  const guess = playerGuessInput.value.trim();
  if (!guess) return alert("Enter your guess!");
  socket.emit("submit_guess", { sessionId, guess });
  playerGuessInput.value = "";
});

socket.on("guess:result", ({ correct, attemptsLeft }) => {
  attemptsDisplay.textContent = `Attempts left: ${attemptsLeft}`;
});

// ------------------------
// Master Controls
// ------------------------
startQuestionBtn.addEventListener("click", () => {
  const questionText = questionInput.value.trim();
  const answerText = answerInput.value.trim();
  if (!questionText || !answerText) return alert("Enter both question and answer");

  socket.emit("start_question", {
    sessionId,
    question: {
      questionText,
      answer: answerText,
      duration: 60
    }
  });

  questionInput.value = "";
  answerInput.value = "";
});

// ------------------------
// Chat
// ------------------------
sendChatBtn.addEventListener("click", () => {
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit("chat:send", { sessionId, message: msg });
  chatInput.value = "";
});

chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendChatBtn.click();
});

// ------------------------
// Socket Event Handlers
// ------------------------
socket.on("role:assigned", ({ role }) => applyRoleUI(role));

socket.on("session:state", ({ connectedPlayers, connectedPlayersCount }) => {
  renderPlayers(connectedPlayers);
  activeCountEl.textContent = connectedPlayersCount;
});

socket.on("game:question", ({ question, players, duration }) => {
  questionTextEl.textContent = question;
  if (userRole === "player") playerAnswerBox.style.display = "flex";

  const me = players.find(p => p.userId === userId);
  if (me) attemptsDisplay.textContent = `Attempts left: ${me.attemptsLeft}`;

  if (timerInterval) clearInterval(timerInterval);
  let timeLeft = duration;
  timerEl.textContent = `${timeLeft}s`;

  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `${timeLeft}s`;
    if (timeLeft <= 0) clearInterval(timerInterval);
  }, 1000);
});

socket.on("question:ended", ({ winner, answer, message }) => {
  addSystemMessage(message || `Answer: ${answer}`);
  if (userRole === "player") playerAnswerBox.style.display = "none";
  if (timerInterval) clearInterval(timerInterval);
  timerEl.textContent = "0s";
});

socket.on("game:ended", ({ players, winner }) => {
  addSystemMessage(`Game over! Winner: ${winner || "No one"}`);
  renderPlayers(players);
});

socket.on("master:changed", ({ newMaster, players }) => {
  addSystemMessage(`New master: ${newMaster}`);
  renderPlayers(players);
  const masterPlayer = players.find(p => p.userId === userId);
  if (masterPlayer?.role === "master") applyRoleUI("master");
  else applyRoleUI("player");
});

socket.on("chat:new", ({ user, message }) => addChatMessage(user, message));
socket.on("message:new", ({ text }) => addSystemMessage(text));
socket.on("message:error", ({ text }) => addSystemMessage(`Error: ${text}`));

// ------------------------
// Join session on load
// ------------------------
if (sessionId && userId) {
  socket.emit("join_session", { sessionId, userName, userId });
}
