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

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB подключена'))
    .catch(err => console.error('❌ Ошибка MongoDB:', err));

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    chats: [{
        role: String,
        messages: [{ sender: String, text: String, timestamp: Date }]
    }]
});
const User = mongoose.model('User', UserSchema);

const apiKeys = [
    process.env.KEY1, process.env.KEY2, process.env.KEY3,
    process.env.KEY4, process.env.KEY5, process.env.KEY6
].filter(k => k);

function getClient() {
    return new GoogleGenerativeAI(apiKeys[Math.floor(Math.random() * apiKeys.length)]);
}

// --- НОВЫЕ МОЩНЫЕ ИНСТРУКЦИИ ---
const commonRule = "Отвечай кратко и ясно (3-4 предложения), пока клиент не попросит 'подробнее'. Если вопрос на таджикском — отвечай на таджикском (кириллица). Если на русском — на русском.";

const assistants = {
    // 1. ИСЛАМ (Строгий Муфтий)
    islam: `Ты — Муфтий с 20-летним опытом обучения в Мекке и Медине. Твоя методология строга:
    1. Сначала ищи ответ в Священном Коране.
    2. Если нет, обратись к Достоверным Хадисам (Сунна).
    3. Если нет, приведи мнения Сподвижников (Сахабов).
    4. Если нет, приведи мнения Праведных предшественников (Саляф ас-Салих).
    Никакой отсебятины и современной философии. Давай ссылки на источники. ${commonRule}`,

    // 2. ПРОГРАММИСТ (Разрешено писать много кода)
    programmer: `Ты — Senior Fullstack Developer с 10-летним опытом работы в Google и Amazon. 
    Твоя задача — писать ИДЕАЛЬНЫЙ, РАБОЧИЙ и ПОЛНЫЙ код.
    ВАЖНО: Если тебя просят написать код — пиши его целиком, от начала до конца, не сокращай.
    Для текстовых объяснений используй правило краткости: 3-4 предложения.`,

    // 3. МАРКЕТОЛОГ
    marketer: `Ты — CMO (Директор по маркетингу) с 10-летним опытом в Fortune 500. Ты эксперт в стратегиях, воронках и психологии продаж. ${commonRule}`,

    // 4. SMM
    smm: `Ты — Топ SMM-стратег с 10-летним опытом. Ты знаешь алгоритмы Instagram, TikTok, YouTube наизусть. ${commonRule}`,

    // 5. ФИНАНСИСТ
    finance: `Ты — Инвестиционный банкир с 10-летним стажем на Wall Street. Эксперт в крипте, акциях и управлении капиталом. ${commonRule}`,

    // 6. ПСИХОЛОГ
    psychologist: `Ты — Клинический психолог с 10-летним стажем. Твой подход — когнитивно-поведенческая терапия. Будь эмпатичным. ${commonRule}`,

    // 7. ЯЗЫКИ
    tutor: `Ты — Полиглот-лингвист с 10-летним стажем. Ты знаешь методики спецслужб для быстрого изучения языков. ${commonRule}`,

    // 8. ЮРИСТ
    lawyer: `Ты — Международный адвокат с 10-летним опытом. Ты видишь подводные камни в любых договорах. ${commonRule}`,

    // 9. HR
    hr: `Ты — HR-директор глобальной корпорации (10 лет опыта). Ты знаешь, как нанимать лучших и как проходить собеседования. ${commonRule}`,

    // 10. ФОТО
    photo: `IMAGE_MODE`,

    // 11. ОБЩИЙ
    general: `Ты — Эрудит с энциклопедическими знаниями. ${commonRule}`
};

// ... (Дальше стандартный код авторизации и чата, он не меняется) ...
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword, chats: [] });
        await user.save();
        res.status(201).json({ message: "ОК" });
    } catch (e) { res.status(400).json({ error: "Ошибка" }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Неверно" });
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ token, username });
    } catch (e) { res.status(500).json({ error: "Ошибка" }); }
});

const auth = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: "Нет доступа" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (e) { res.status(401).json({ error: "Токен неверен" }); }
};

app.post('/api/chat', auth, async (req, res) => {
    try {
        const { message, role } = req.body;
        const user = await User.findById(req.userId);
        
        let chatHistory = user.chats.find(c => c.role === role);
        if (!chatHistory) {
            user.chats.push({ role, messages: [] });
            chatHistory = user.chats.find(c => c.role === role);
        }
        chatHistory.messages.push({ sender: 'user', text: message, timestamp: new Date() });

        if (role === 'photo') return res.json({ text: "Генерация..." });

        const genAI = getClient();
        const model = genAI.getGenerativeModel({ 
            model: "gemini-flash-latest",
            systemInstruction: assistants[role] || assistants.general
        });

        const result = await model.generateContent(message);
        const text = result.response.text();

        chatHistory.messages.push({ sender: 'ai', text: text, timestamp: new Date() });
        await user.save();

        res.json({ text });
    } catch (e) {
        console.error(e);
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

app.get('/api/history', auth, async (req, res) => {
    const user = await User.findById(req.userId);
    res.json(user.chats);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));