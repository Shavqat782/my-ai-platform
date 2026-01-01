/* HALAL GUIDE ENTERPRISE SERVER v2.0
   Author: Abdulla & Gemini
   Features: Auth, MongoDB, Payments, Daily Limits, AI Analysis
*/

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Для шифрования паролей
const jwt = require('jsonwebtoken'); // Для токенов авторизации
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

// --- 1. ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ (MONGODB) ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected (Database Active)'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Схема пользователя (Что мы знаем о клиенте)
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isPremium: { type: Boolean, default: false }, // Платный или Халявщик
    scansToday: { type: Number, default: 0 },     // Счетчик на сегодня
    lastRequestDate: { type: String, default: new Date().toLocaleDateString() }, // Дата последнего скана
    joinedAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// --- 2. НАСТРОЙКИ AI ---
const apiKeys = [
    process.env.KEY1, process.env.KEY2, process.env.KEY3,
    process.env.KEY4, process.env.KEY5, process.env.KEY6
].filter(k => k);

function getClient() {
    return new GoogleGenerativeAI(apiKeys[Math.floor(Math.random() * apiKeys.length)]);
}

const ANALYZE_PROMPT = `
Ты — Мусульманский пищевой технолог. Твоя цель — найти ХАРАМ.
Критерии: Свинина, Е120 (Кармин), Алкоголь (как ингредиент), Желатин (не халяль), Кошениль.
Ответ СТРОГО JSON: { "status": "HALAL"|"HARAM"|"MUSHBOOH", "reason": "...", "ingredients_detected": [...] }
`;

const IMAM_INSTRUCTION = "Ты Муфтий. Отвечай кратко по Корану и Сунне. На таджикском отвечай кириллицей.";

// --- 3. MIDDLEWARE (ОХРАННИК) ---
// Проверяет, вошел ли пользователь в систему
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization');
        if (!token) return res.status(401).json({ error: "Access Denied" });
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        if (!user) return res.status(401).json({ error: "User not found" });

        // ПРОВЕРКА НОВОГО ДНЯ (Сброс счетчика)
        const today = new Date().toLocaleDateString();
        if (user.lastRequestDate !== today) {
            user.scansToday = 0;
            user.lastRequestDate = today;
            await user.save();
        }
        
        req.user = user;
        next();
    } catch (e) { res.status(401).json({ error: "Invalid Token" }); }
};

// Проверяет лимиты (3 скана для бесплатных)
const checkLimit = async (req, res, next) => {
    if (req.user.isPremium) {
        return next(); // Премиуму можно всё
    }
    if (req.user.scansToday >= 3) {
        return res.status(403).json({ 
            error: "LIMIT_REACHED", 
            message: "Лимит на сегодня исчерпан. Оформите Premium за 15 TJS!" 
        });
    }
    next();
};

// --- 4. API АВТОРИЗАЦИИ ---

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        // Проверка: есть ли такой юзер?
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: "Это имя уже занято" });

        // Шифруем пароль
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        
        // Сразу создаем токен, чтобы он вошел автоматом
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.status(201).json({ token, isPremium: false, username });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
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
        res.json({ token, isPremium: user.isPremium, username: user.username });
    } catch (e) { res.status(500).json({ error: "Ошибка входа" }); }
});

// Получение данных о себе (для профиля)
app.get('/api/me', auth, async (req, res) => {
    res.json({ 
        username: req.user.username, 
        isPremium: req.user.isPremium,
        scansToday: req.user.scansToday 
    });
});

// ПОКУПКА ПРЕМИУМА (Симуляция)
app.post('/api/buy-premium', auth, async (req, res) => {
    req.user.isPremium = true;
    await req.user.save();
    res.json({ success: true, message: "Оплата прошла успешно! Вы теперь Premium." });
});

// --- 5. ФУНКЦИОНАЛ (СКАНЕР, ЧАТ) ---

// Сканирование штрихкода (с учетом лимитов)
app.post('/api/barcode', auth, checkLimit, async (req, res) => {
    try {
        // Увеличиваем счетчик
        if (!req.user.isPremium) {
            req.user.scansToday += 1;
            await req.user.save();
        }

        const { code } = req.body;
        const dbRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        const data = await dbRes.json();

        if (data.status === 1) {
            const p = data.product;
            const name = p.product_name_ru || p.product_name || "Товар";
            const ings = p.ingredients_text_ru || p.ingredients_text_en;
            
            if (ings) {
                const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
                const aiRes = await model.generateContent([ANALYZE_PROMPT, `Товар: ${name}. Состав: ${ings}`]);
                const text = aiRes.response.text().replace(/```json|```/g, '').trim();
                return res.json({ found: true, hasIngredients: true, name, ...JSON.parse(text) });
            }
            return res.json({ found: true, hasIngredients: false, name });
        }
        res.json({ found: false });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

// Сканирование фото (с учетом лимитов)
app.post('/api/photo', auth, checkLimit, async (req, res) => {
    try {
        if (!req.user.isPremium) {
            req.user.scansToday += 1;
            await req.user.save();
        }
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent([
            ANALYZE_PROMPT, 
            { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } }
        ]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) { res.status(500).json({ status: "ERROR" }); }
});

// Чат с Имамом
app.post('/api/chat', auth, async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ 
            model: "gemini-flash-latest", 
            systemInstruction: IMAM_INSTRUCTION 
        });
        const result = await model.generateContent(req.body.message);
        res.json({ text: result.response.text() });
    } catch (e) { res.status(500).json({ text: "Ошибка связи." }); }
});

// Хадис дня (бесплатно)
app.get('/api/daily', async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(`Пришли 1 Аят или Хадис. JSON: {"arabic": "...", "translation": "...", "source": "..."}`);
        res.json(JSON.parse(result.response.text().replace(/```json|```/g, '').trim()));
    } catch (e) { res.json({ translation: "Аллах любит терпеливых.", arabic: "الله يحب الصابرين" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BUSINESS SERVER RUNNING ON PORT ${PORT}`));