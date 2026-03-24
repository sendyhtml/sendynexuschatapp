const { Server } = require("socket.io");
const mongoose = require("mongoose");
const Message = require("../models/Message");

// Koneksi MongoDB (gunakan environment variable)
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI tidak ditemukan di environment variables");
}

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }
  
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  
  cachedDb = mongoose.connection;
  return cachedDb;
}

export default async function handler(req, res) {
  if (!res.socket.server.io) {
    await connectToDatabase();
    
    const io = new Server(res.socket.server, {
      path: "/api/socket",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });
    
    io.on("connection", async (socket) => {
      console.log("New client connected");
      
      // Kirim pesan sebelumnya ke client baru
      try {
        const previousMessages = await Message.find().sort({ timestamp: 1 }).limit(50);
        socket.emit("previousMessages", previousMessages);
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
      
      socket.on("sendMessage", async (data) => {
        const { user, message } = data;
        
        if (!user || !message || message.trim() === "") return;
        
        const newMessage = new Message({
          user: user.trim(),
          message: message.trim(),
          timestamp: new Date(),
        });
        
        try {
          await newMessage.save();
          io.emit("receiveMessage", newMessage);
        } catch (err) {
          console.error("Error saving message:", err);
        }
      });
      
      socket.on("disconnect", () => {
        console.log("Client disconnected");
      });
    });
    
    res.socket.server.io = io;
  }
  
  res.end();
}