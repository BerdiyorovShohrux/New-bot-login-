const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const Telegraf = require('telegraf');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Frontend URL’ni qo‘ying (masalan, https://your-frontend.onrender.com)
    methods: ['GET', 'POST']
  }
});

const User = require('./models/User');

// Middleware
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false
}));

// MongoDB ulanishi
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000, // 30 soniya
  socketTimeoutMS: 45000, // 45 soniya
  autoIndex: false // Render’da indekslashni o‘chirish
})
.then(() => console.log('MongoDB ga ulanish muvaffaqiyatli, vaqt:', new Date().toISOString()))
.catch((err) => console.error('MongoDB ulanish xatosi:', err.message, 'vaqt:', new Date().toISOString()));

// Telegram bot
const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => ctx.reply('Salom! Bot ishga tushdi! /help uchun yozing.'));
bot.help((ctx) => ctx.reply('Bu chat bot. /start - boshlash, /help - yordam.'));
bot.launch();

// Webhook uchun
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Socket.IO ulanishi
io.on('connection', (socket) => {
  console.log('Foydalanuvchi ulandi:', socket.id);

  socket.on('chat message', (msg) => {
    io.emit('chat message', { username: socket.handshake.session?.user?.username || 'Anonim', message: msg });
    bot.telegram.sendMessage(process.env.CHAT_ID || '', `${socket.handshake.session?.user?.username || 'Anonim'}: ${msg}`);
  });

  socket.on('disconnect', () => {
    console.log('Foydalanuvchi uzildi:', socket.id);
  });
});

// Login router
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).send('Foydalanuvchi topilmadi');
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).send('Noto‘g‘ri parol');
    req.session.user = { username };
    res.send('Login muvaffaqiyatli');
  } catch (err) {
    console.error('Login xatosi:', err);
    res.status(500).send('Server xatosi');
  }
});

// Logout router
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send('Chiqishda xatolik');
    res.send('Chiqish muvaffaqiyatli');
  });
});

// Port sozlamasi
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server ${PORT} portida ishga tushdi, vaqt:`, new Date().toISOString());
});

// Har 5 daqiqada ulanish holatini tekshirish
setInterval(() => {
  mongoose.connection.db.admin().ping((err, result) => {
    if (err) console.error('Ping xatosi:', err.message, 'vaqt:', new Date().toISOString());
    else console.log('MongoDB ping muvaffaqiyatli:', new Date().toISOString());
  });
}, 300000); // 5 daqiqa


