const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron'); // ✅ Added this line

const app = express();
const server = http.createServer(app); // Needed for Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect('mongodb+srv://ram:1234@badminton.b78dq.mongodb.net/badminton', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Mongoose model
const ShopStatusSchema = new mongoose.Schema({
  isOpen: Boolean,
}, { collection: 'shopStatus' });

const ShopStatus = mongoose.model('ShopStatus', ShopStatusSchema);

// Initialize default status
async function initializeStatus() {
  const count = await ShopStatus.countDocuments();
  if (count === 0) {
    await new ShopStatus({ isOpen: false }).save();
  }
}
initializeStatus();

// ✅ Cron job to set shop status to OPEN at 5:00 AM daily
cron.schedule('0 5 * * *', async () => {
  try {
    const status = await ShopStatus.findOne();
    if (status) {
      status.isOpen = true;
      await status.save();
      io.emit('shopStatusUpdated', { isOpen: true });
      console.log('✅ Shop status set to OPEN at 5:00 AM');
    } else {
      console.log('❌ Shop status not found during 5:00 AM cron job');
    }
  } catch (error) {
    console.error('🚨 Failed to update shop status at 5:00 AM:', error);
  }
});

// API Routes
app.post('/verify', (req, res) => {
  const { key } = req.body;
  res.json({ verified: key === 'secret123' });
});

app.get('/shop-status', async (req, res) => {
  try {
    const status = await ShopStatus.findOne();
    res.json({ isOpen: status?.isOpen });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch shop status' });
  }
});

app.post('/shop-status', async (req, res) => {
  const { isOpen } = req.body;
  try {
    const status = await ShopStatus.findOne();
    if (status) {
      status.isOpen = isOpen;
      await status.save();
      io.emit('shopStatusUpdated', { isOpen }); // 🔁 Notify all clients via Socket.IO
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Shop status not initialized.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update shop status' });
  }
});

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('shopStatusChange', async (data) => {
    const { isOpen } = data;
    const status = await ShopStatus.findOne();
    if (status) {
      status.isOpen = isOpen;
      await status.save();
      io.emit('shopStatusUpdated', { isOpen }); // Broadcast to all clients
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
