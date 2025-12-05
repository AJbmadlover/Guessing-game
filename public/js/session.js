import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";

const socket = io();

// Elements
const sessionBanner = document.getElementById('sessionBanner');
const systemMessages = document.getElementById('systemMessages');
const questionText = document.getElementById('questionText');
const answerText = document.getElementById('answerText');
const add_Question = document.getElementById('add_Question');
const durationInput = document.getElementById('duration');
const startGameBtn = document.getElementById('startGameBtn');
const leaderboard = document.getElementById('leaderboard');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

let sessionId = sessionStorage.getItem("sessionId");
let masterName = sessionStorage.getItem("masterName");

// Display session ID & master name
sessionBanner.textContent = ` ${masterName} ${sessionId}`;// replace dynamically 
sessionBanner.onclick = () => {
  navigator.clipboard.writeText(sessionId);
  alert("Session ID copied to clipboard!");
};

// ------------------------
// Handle system messages
// ------------------------
socket.on('session:created', msg => {
  const div = document.createElement('div');
  div.textContent = `[${new Date(msg.timestamp).toLocaleTimeString()}] ${msg.text}`;
  systemMessages.appendChild(div);
  systemMessages.scrollTop = systemMessages.scrollHeight;
});

// ------------------------
// Start game (master only)
// ------------------------
startGameBtn.onclick = () => {
  const qText = questionText.value.trim();
  const ans = answerText.value.trim();
  let dur = parseInt(durationInput.value) || 60;
  if(dur < 30) dur = 30;
  if(dur > 90) dur = 90;

  socket.emit('add_questions', { sessionId, questions: [{ questionText: qText, answer: ans, duration: dur }]});
  socket.emit('start_game', { sessionId });
};

// ------------------------
// Chat
// ------------------------
sendChatBtn.onclick = () => {
  const msg = chatInput.value.trim();
  if(!msg) return;
  socket.emit('chat:send', { sessionId, message: msg });
  chatInput.value = '';
};

socket.on('chat:new', data => {
  const div = document.createElement('div');
  div.textContent = `${data.user}: ${data.message}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// ------------------------
// Update leaderboard
// ------------------------
socket.on('question:ended', ({ players }) => updateLeaderboard(players));
socket.on('game:ended', ({ players }) => updateLeaderboard(players));

function updateLeaderboard(players) {
  leaderboard.innerHTML = '<b>Leaderboard</b><br>';
  players.sort((a,b) => b.score - a.score).forEach(p => {
    const div = document.createElement('div');
    div.textContent = `${p.name} — ${p.score} pts`;
    leaderboard.appendChild(div);
  });
}