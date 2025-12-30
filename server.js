const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// --- 1. ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB подключена'))
    .catch(err => console.error('❌ Ошибка MongoDB:', err));

// Схема пользователя (Логин, Пароль, История чатов)
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    chats: [{
        role: String,
        messages: [{ sender: String, text: String, timestamp: Date }]
    }]
});
const User = mongoose.model('User', UserSchema);

// --- 2. РОТАЦИЯ КЛЮЧЕЙ ---
const apiKeys = [
    process.env.KEY1, process.env.KEY2, process.env.KEY3,
    process.env.KEY4, process.env.KEY5, process.env.KEY6
].filter(k => k);

function getClient() {
    return new GoogleGenerativeAI(apiKeys[Math.floor(Math.random() * apiKeys.length)]);
}

// --- 3. НАСТРОЙКИ АССИСТЕНТОВ ---
const baseRule = "У тебя более 10 лет опыта. Ответы краткие и ясные. Если просят подробнее - расписывай. Поддерживай голосовой формат.";
const assistants = {
    islam: `Ты — Муфтий (20 лет опыта, Мекка). Ответы СТРОГО по Корану и Хадисам. На таджикские вопросы отвечай таджикской кириллицей. ${baseRule}`,
    marketer: `Ты — Маркетолог. ${baseRule}`,
    smm: `Ты — SMM эксперт. ${baseRule}`,
    finance: `Ты — Финансист. ${baseRule}`,
    programmer: `Ты — Senior Developer. ${baseRule}`,
    psychologist: `Ты — Психолог. ${baseRule}`,
    tutor: `Ты — Учитель языков. ${baseRule}`,
    lawyer: `Ты — Юрист. ${baseRule}`,
    hr: `Ты — HR. ${baseRule}`,
    photo: `IMAGE_MODE`,
    general: `Ты — Умный собеседник. ${baseRule}`
};

// --- 4. АВТОРИЗАЦИЯ (РЕГИСТРАЦИЯ И ВХОД) ---

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword, chats: [] });
        await user.save();
        res.status(201).json({ message: "Пользователь создан!" });
    } catch (error) {
        res.status(400).json({ error: "Ошибка регистрации. Возможно, имя занято." });
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: "Пользователь не найден" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Неверный пароль" });

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ token, username });
    } catch (error) {
        res.status(500).json({ error: "Ошибка входа" });
    }
});

// Middleware для проверки токена (Защита)
const auth = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: "Нет доступа" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: "Неверный токен" });
    }
};

// --- 5. ЧАТ С СОХРАНЕНИЕМ ИСТОРИИ ---
app.post('/api/chat', auth, async (req, res) => {
    try {
        const { message, role } = req.body;
        const user = await User.findById(req.userId);

        // 1. Сохраняем сообщение пользователя
        // Ищем историю для этой роли или создаем новую
        let chatHistory = user.chats.find(c => c.role === role);
        if (!chatHistory) {
            user.chats.push({ role, messages: [] });
            chatHistory = user.chats.find(c => c.role === role);
        }
        chatHistory.messages.push({ sender: 'user', text: message, timestamp: new Date() });

        // 2. Генерация ответа
        if (role === 'photo') return res.json({ text: "Генерация фото скоро..." });

        const genAI = getClient();
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest", systemInstruction: assistants[role] || assistants.general });
        
        const result = await model.generateContent(message);
        const text = result.response.text();

        // 3. Сохраняем ответ бота
        chatHistory.messages.push({ sender: 'ai', text: text, timestamp: new Date() });
        await user.save();

        res.json({ text });

    } catch (error) {
        console.error(error);
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

// Получение истории (чтобы загружать старые сообщения)
app.get('/api/history', auth, async (req, res) => {
    const user = await User.findById(req.userId);
    res.json(user.chats);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер работает на порту ${PORT}`));