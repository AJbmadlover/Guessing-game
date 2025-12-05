const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const connectDB = require('./config/db');
const PORT = process.env.PORT || 4000;
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
// const io = new Server(server);
const socketHandler = require('./socketHandler');
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})
// Connect to MongoDB
connectDB();
// Use the socket handler
socketHandler(io);
// Middleware to parse JSON requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Define API routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/sessions', require('./routes/sessionRoutes'));


// Serve frontend static files
app.use(express.static(path.join(__dirname, "public")));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, "public",'index.html'));
});
app.get('/session/:id', (req, res) => {
  res.sendFile(path.join(__dirname, "public",'session.html'));
});


// Start server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));