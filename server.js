const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const mongoose = require('mongoose');
const axios = require('axios');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// MongoDB User Model
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// MongoDB Message Model
const messageSchema = new mongoose.Schema({
  username: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// MongoDB ulanish
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB Atlas bilan ulanish muvaffaqiyatli!'))
  .catch(err => console.error('MongoDB ulanishda xato:', err));

// Sessiya sozlamalari
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'strong-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
});

app.use(sessionMiddleware);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Foydalanuvchilarni MongoDB’ga qo‘shish (bir marta ishlatiladi)
async function initializeUsers() {
  const users = {
    "Abbos_Abduhalilov": "ABBOS1234",
    "Sevinch_Abilqosimova": "Seva5678",
    "Sevinch_Akromova": "Sevinchoy9101",
    "Aziz_Ahmatov": "Aziz1213",
    "Aziz_Asatullayev": "Aziz1415",
    "Nodir_Baqoyev": "Nodir_1617",
    "Shohrux_Berdiyorov": "Shohrux777",
    "Nodira_Erkinova": "Nodira1819",
    "Kamol_Fayziqulov": "Kamol2021",
    "Fayoz_Jumaboyev": "Fayoz2223",
    "Sevinch_Keldiboyeva": "Sevgi12_07",
    "Parizod_Nasimova": "Parizod2425",
    "Orziqulov_Jamshid": "Jamshid2627",
    "Samandar_Ochilov": "Samandar2728",
    "Samandar_Olimov": "Samandar_2930",
    "Azamat_Rahmatov": "Azamat3132",
    "Sabina_Rashidova": "Sabina3334",
    "Sabina_Sunnatullayeva": "Sabina3536",
    "Xadicha_Tojimurodova": "Xadicha3738",
    "Muslim_Tojimurodov": "Muslim3940",
    "Bunyod_Gaybullayev": "Bunyod2510",
    "Islom_Ganiyev": "Islom4142",
    "Abdulloh_Nurillayev": "Abdulloh4344",
    "Asil_Nishonov": "Asil4344",
    "jahongir_Juraqulov": "JahongirJR4546",
    "Nargiza_Ummatqulova": "Nargiz4748"
  };

  for (const [username, password] of Object.entries(users)) {
    const existingUser = await User.findOne({ username });
    if (!existingUser) {
      const user = new User({ username, password });
      await user.save();
      console.log(`Foydalanuvchi ${username} qo‘shildi`);
    }
  }
}

// Server ishga tushganda foydalanuvchilarni qo‘shish
mongoose.connection.once('open', () => {
  initializeUsers();
});

// Login endpointi
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Foydalanuvchi nomi va parol kiritilishi shart' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Noto‘g‘ri foydalanuvchi nomi yoki parol' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Noto‘g‘ri foydalanuvchi nomi yoki parol' });
    }

    req.session.username = username;

    // Telegramga xabar yuborish
    try {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: `👤 *${username}* saytga kirdi\n🕒 Vaqt: ${new Date().toLocaleString('uz-UZ')}`,
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Telegram xatosi:', error.message);
    }

    return res.status(200).json({ message: 'Login muvaffaqiyatli' });
  } catch (error) {
    console.error('Login xatosi:', error);
    return res.status(500).json({ error: 'Server xatosi' });
  }
});

// Sessiya tekshiruvi
app.get('/session', (req, res) => {
  if (req.session.username) {
    res.json({ username: req.session.username });
  } else {
    res.status(401).json({ error: 'Sessiya topilmadi' });
  }
});

// Chiqish
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Asosiy sahifa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO sessiya integratsiyasi
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Socket.IO ulanishlari
io.on('connection', async (socket) => {
  const req = socket.request;
  if (!req.session.username) {
    socket.emit('no session', 'Sessiya topilmadi, qayta login qiling.');
    return;
  }

  const username = req.session.username;
  const history = await Message.find().sort({ createdAt: 1 }).limit(100);
  const messages = history.map(msg => `${msg.username}: ${msg.message}`);
  socket.emit('chat history', messages);

  socket.broadcast.emit('user joined', `${username} chatga qo‘shildi.`);

  socket.on('chat message', async (msg) => {
    const fullMsg = `${username}: ${msg}`;
    const newMessage = new Message({ username, message: msg });
    await newMessage.save();
    io.emit('chat message', fullMsg);
  });

  socket.on('disconnect', () => {
    io.emit('user left', `${username} chatdan chiqdi.`);
  });
});

server.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishlayapti`);
});