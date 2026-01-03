/* HALAL GUIDE ULTIMATE SERVER */
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

// 1. БАЗА ДАННЫХ
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isPremium: { type: Boolean, default: false },
    scansToday: { type: Number, default: 0 },
    lastLogin: { type: String, default: new Date().toLocaleDateString() },
    joinedAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

// 2. AI МОЗГИ
const apiKeys = [process.env.KEY1, process.env.KEY2, process.env.KEY3].filter(k => k);
function getClient() { return new GoogleGenerativeAI(apiKeys[Math.floor(Math.random() * apiKeys.length)]); }

const ANALYZE_PROMPT = `Ты Технолог Халяль. Ищи ХАРАМ: Свинина, Е120, Кармин, Спирт, Желатин (не халяль). JSON ответ: { "status": "HALAL"|"HARAM"|"MUSHBOOH", "reason": "...", "ingredients_detected": [...] }`;
const IMAM_PROMPT = `Ты Муфтий. Отвечай кратко, мудро, по Корану и Сунне. На таджикском пиши кириллицей.`;

// 3. ЗАЩИТА И ЛИМИТЫ
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization');
        if(!token) return res.status(401).json({error: "Нет доступа"});
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        // Сброс счетчика, если новый день
        const today = new Date().toLocaleDateString();
        if(user.lastLogin !== today) { user.scansToday = 0; user.lastLogin = today; await user.save(); }
        
        req.user = user; next();
    } catch(e) { res.status(401).json({error: "Токен неверен"}); }
};

const checkLimit = async (req, res, next) => {
    if(req.user.isPremium) return next();
    if(req.user.scansToday >= 3) return res.status(403).json({error: "LIMIT", message: "Лимит бесплатных проверок исчерпан."});
    req.user.scansToday += 1; await req.user.save(); next();
};

// 4. API: АВТОРИЗАЦИЯ
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hash = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hash });
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ token, username, isPremium: false });
    } catch(e) { res.status(400).json({ error: "Имя занято" }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if(!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Неверно" });
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ token, username, isPremium: user.isPremium });
    } catch(e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

app.get('/api/me', auth, (req, res) => res.json({ user: { username: req.user.username, isPremium: req.user.isPremium } }));

// 5. API: ФУНКЦИИ
app.post('/api/barcode', auth, checkLimit, async (req, res) => {
    try {
        const { code } = req.body;
        const dbRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        const data = await dbRes.json();

        if (data.status === 1) {
            const p = data.product;
            const name = p.product_name_ru || p.product_name || "Товар";
            const ings = p.ingredients_text_ru || p.ingredients_text_en;
            if (ings) {
                const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
                const aiRes = await model.generateContent([ANALYZE_PROMPT, `Товар: ${name}. Состав: ${ings}`]);
                const text = aiRes.response.text().replace(/```json|```/g, '').trim();
                return res.json({ found: true, hasIngredients: true, name, ...JSON.parse(text) });
            }
            return res.json({ found: true, hasIngredients: false, name });
        }
        res.json({ found: false });
    } catch (e) { res.status(500).json({ error: "Ошибка" }); }
});

app.post('/api/photo', auth, checkLimit, async (req, res) => {
    try {
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent([ANALYZE_PROMPT, { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } }]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) { res.status(500).json({ status: "ERROR" }); }
});

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
        const result = await model.generateContent(`Пришли 1 Аят или Хадис JSON: {"arabic": "...", "translation": "...", "source": "..."}`);
        res.json(JSON.parse(result.response.text().replace(/```json|```/g, '').trim()));
    } catch (e) { res.json({ translation: "Аллах велик", arabic: "الله أكبر" }); }
});

// 6. АДМИН ПАНЕЛЬ (Скрытая)
app.get('/api/admin/users', async (req, res) => {
    const users = await User.find({}, 'username isPremium scansToday lastLogin');
    res.json(users);
});
app.post('/api/admin/toggle', async (req, res) => {
    const { id, status } = req.body;
    await User.findByIdAndUpdate(id, { isPremium: status });
    res.json({ success: true });
});

app.listen(process.env.PORT || 3000, () => console.log('🚀 Server Started'));