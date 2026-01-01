/* HALAL GUIDE ENTERPRISE SERVER
   Features: Auth, MongoDB, Payments, Limits, Gemini AI
*/

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

// --- 1. БАЗА ДАННЫХ (MongoDB) ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ База данных подключена'))
    .catch(err => console.error('❌ Ошибка базы:', err));

// Схема пользователя
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isPremium: { type: Boolean, default: false }, // Платный или нет
    scansToday: { type: Number, default: 0 },     // Сколько сканировал сегодня
    lastLogin: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// --- 2. НАСТРОЙКИ ИИ ---
const apiKeys = [process.env.KEY1, process.env.KEY2, process.env.KEY3, process.env.KEY4, process.env.KEY5, process.env.KEY6].filter(k => k);
function getClient() { return new GoogleGenerativeAI(apiKeys[Math.floor(Math.random() * apiKeys.length)]); }

const ANALYZE_PROMPT = `Ты технолог Халяль. Ищи: Свинину, Е120, Кармин, Спирт, Желатин (не халяль). JSON: { "status": "HALAL"|"HARAM"|"MUSHBOOH", "reason": "...", "ingredients_detected": [...] }`;
const IMAM_PROMPT = `Ты Муфтий. Отвечай кратко по Корану и Сунне.`;

// --- 3. MIDDLEWARE (ЗАЩИТА И ЛИМИТЫ) ---
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization');
        if (!token) return res.status(401).json({ error: "Нужен вход" });
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        req.user = await User.findById(decoded.userId);
        next();
    } catch (e) { res.status(401).json({ error: "Неверный токен" }); }
};

const checkLimit = async (req, res, next) => {
    if (req.user.isPremium) return next(); // Платным можно всё
    if (req.user.scansToday >= 3) {
        return res.status(403).json({ error: "LIMIT_REACHED", message: "Лимит исчерпан. Купите Premium!" });
    }
    next();
};

// --- 4. API: АВТОРИЗАЦИЯ ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.status(201).json({ message: "Успешно" });
    } catch (e) { res.status(400).json({ error: "Имя занято" }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Неверные данные" });
        
        // Сброс счетчика, если новый день (упрощено)
        const now = new Date();
        if (new Date(user.lastLogin).getDate() !== now.getDate()) {
            user.scansToday = 0;
            user.lastLogin = now;
            await user.save();
        }

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret');
        res.json({ token, isPremium: user.isPremium, scansToday: user.scansToday });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

// СИМУЛЯЦИЯ ОПЛАТЫ (В реальности тут Stripe или Алиф)
app.post('/api/buy-premium', auth, async (req, res) => {
    req.user.isPremium = true;
    await req.user.save();
    res.json({ success: true, message: "Вы теперь Premium! МашаАллах." });
});

// --- 5. API: ФУНКЦИИ ---

// БАРКОД (С проверкой лимита)
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
                const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
                const aiRes = await model.generateContent([ANALYZE_PROMPT, `Состав: ${ings}`]);
                const text = aiRes.response.text().replace(/```json|```/g, '').trim();
                return res.json({ found: true, hasIngredients: true, name, ...JSON.parse(text) });
            }
            return res.json({ found: true, hasIngredients: false, name });
        }
        res.json({ found: false });
    } catch (e) { res.status(500).json({ error: "Ошибка" }); }
});

// ФОТО (С проверкой лимита)
app.post('/api/photo', auth, checkLimit, async (req, res) => {
    try {
        if (!req.user.isPremium) {
            req.user.scansToday += 1;
            await req.user.save();
        }
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent([ANALYZE_PROMPT, { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } }]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) { res.status(500).json({ status: "ERROR" }); }
});

// ЧАТ
app.post('/api/chat', auth, async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest", systemInstruction: IMAM_PROMPT });
        const result = await model.generateContent(req.body.message);
        res.json({ text: result.response.text() });
    } catch (e) { res.status(500).json({ text: "Ошибка связи." }); }
});

app.get('/api/daily', async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(`Пришли 1 Аят или Хадис. JSON: {"arabic": "...", "translation": "...", "source": "..."}`);
        res.json(JSON.parse(result.response.text().replace(/```json|```/g, '').trim()));
    } catch (e) { res.json({ translation: "Аллах с нами.", arabic: "الله معانا" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 BUSINESS SERVER RUNNING ON ${PORT}`));