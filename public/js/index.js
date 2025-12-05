import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";


const socket = io();


// Input + buttons
const nameInput = document.querySelector("input[placeholder='Enter Name']");
const createBtn = document.getElementById("createSessionBtn");
const joinBtn = document.getElementById("joinSessionBtn");

// Modal elements
const modal = document.getElementById("sessionModal");
const closeModal = document.getElementById("closeModal");
const confirmJoin = document.getElementById("confirmJoin");
const sessionIdInput = document.getElementById("sessionIdInput");

// Create a session
createBtn.onclick = () => {
  const masterName = nameInput.value.trim();
  if (!masterName) return setTimeout(()=>{
    alert("Enter your name first");}, 1000);

  const sessionId = crypto.randomUUID().replace(/-/g, '').slice(0,6); // temporary unique session ID

  socket.emit("create_session", { sessionId, masterName });

  // Redirect later to your session page
  console.log("Session created:", sessionId, masterName);
  sessionStorage.setItem("masterName", masterName);
  sessionStorage.setItem("sessionId", sessionId);
  window.location.href = `/session/${sessionId}`;
};

// Join session → open modal
joinBtn.onclick = () => {
  if (!nameInput.value.trim()) return alert("Enter your name first");
  modal.style.display = "flex";

};

// Modal join confirm
confirmJoin.onclick = () => {
  const sessionId = sessionIdInput.value.trim();
  const userName = nameInput.value.trim();

  if (!sessionId) return alert("Enter a session ID");

  socket.emit("join_session", { sessionId, userName });

  window.location.href = `/session/${sessionId}`;
};

// Close modal
closeModal.onclick = () => {
  modal.style.display = "none";
};

// Listen for system messages
socket.on("message:new", (msg) => {
  console.log("System message:", msg);

  if (msg.text.includes("Session not found")) alert("Invalid Session ID");
  if (msg.text.includes("Game in progress")) alert("Session already in progress");
});
