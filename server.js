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

// --- БАЗА ДАННЫХ ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isPremium: { type: Boolean, default: false },
    scansToday: { type: Number, default: 0 },
    lastLogin: { type: String, default: new Date().toLocaleDateString() }
});
const User = mongoose.model('User', UserSchema);

// --- AI CONFIG ---
const apiKeys = [process.env.KEY1, process.env.KEY2, process.env.KEY3, process.env.KEY4, process.env.KEY5, process.env.KEY6].filter(k => k);
function getClient() { return new GoogleGenerativeAI(apiKeys[Math.floor(Math.random() * apiKeys.length)]); }

const ANALYZE_PROMPT = `
Ты — Мусульманский технолог. Найди ХАРАМ.
Критерии: Свинина, Е120, Кармин, Спирт/Этанол, Желатин (не халяль).
JSON: { "status": "HALAL"|"HARAM"|"MUSHBOOH", "reason": "...", "ingredients_detected": [...] }
`;
const IMAM_PROMPT = `Ты Муфтий. Отвечай на вопросы по Исламу мудро, с доводами. На таджикском пиши кириллицей.`;

// --- MIDDLEWARE ---
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization');
        if(!token) return res.status(401).json({error: "Auth Error"});
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);
        
        const today = new Date().toLocaleDateString();
        if(user.lastLogin !== today) { user.scansToday = 0; user.lastLogin = today; await user.save(); }
        req.user = user; next();
    } catch(e) { res.status(401).json({error: "Token Invalid"}); }
};

const checkLimit = async (req, res, next) => {
    if(req.user.isPremium) return next();
    if(req.user.scansToday >= 3) return res.status(403).json({error: "LIMIT", message: "Лимит исчерпан"});
    req.user.scansToday += 1; await req.user.save(); next();
};

// --- AUTH API ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hash = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hash });
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ token, username });
    } catch(e) { res.status(400).json({ error: "Имя занято" }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if(!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Ошибка входа" });
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        res.json({ token, username, isPremium: user.isPremium });
    } catch(e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

app.post('/api/buy', auth, async (req, res) => {
    req.user.isPremium = true; await req.user.save();
    res.json({ success: true });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

// --- FUNCTION API ---

// 1. ШТРИХКОД
app.post('/api/barcode', auth, checkLimit, async (req, res) => {
    try {
        const { code } = req.body;
        // 1. Ищем в базе OpenFoodFacts
        const dbRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
        const data = await dbRes.json();

        if (data.status === 1) {
            const p = data.product;
            const name = p.product_name_ru || p.product_name || "Товар";
            const ings = p.ingredients_text_ru || p.ingredients_text_en;
            
            if (ings) {
                // Если есть состав - анализируем ИИ
                const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
                const aiRes = await model.generateContent([ANALYZE_PROMPT, `Товар: ${name}. Состав: ${ings}`]);
                const text = aiRes.response.text().replace(/```json|```/g, '').trim();
                return res.json({ found: true, hasIngredients: true, name, ...JSON.parse(text) });
            }
            // Товар есть, состава нет
            return res.json({ found: true, hasIngredients: false, name });
        }
        // Товара нет
        res.json({ found: false });
    } catch (e) { res.status(500).json({ error: "Ошибка сервера" }); }
});

// 2. ФОТО
app.post('/api/photo', auth, checkLimit, async (req, res) => {
    try {
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent([ANALYZE_PROMPT, { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } }]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) { res.status(500).json({ status: "ERROR" }); }
});

// 3. ЧАТ
app.post('/api/chat', auth, async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest", systemInstruction: IMAM_PROMPT });
        const result = await model.generateContent(req.body.message);
        res.json({ text: result.response.text() });
    } catch (e) { res.status(500).json({ text: "Ошибка связи." }); }
});

// 4. ДЕНЬ
app.get('/api/daily', async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(`Пришли 1 Аят или Хадис JSON: {"arabic": "...", "translation": "...", "source": "..."}`);
        res.json(JSON.parse(result.response.text().replace(/```json|```/g, '').trim()));
    } catch (e) { res.json({ translation: "Аллах велик", arabic: "الله أكبر" }); }
});

app.listen(process.env.PORT || 3000, () => console.log('🚀 Server OK'));