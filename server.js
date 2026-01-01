const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Если у тебя Node.js ниже 18 версии, раскомментируй строку ниже:
// const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

const apiKeys = [
    process.env.KEY1, process.env.KEY2, process.env.KEY3,
    process.env.KEY4, process.env.KEY5, process.env.KEY6
].filter(k => k && k.length > 10); // Фильтруем пустые ключи

function getClient() {
    // Берем случайный рабочий ключ
    const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    return new GoogleGenerativeAI(key);
}

// --- ПРАВИЛА ДЛЯ ИИ ---

const ANALYZE_PROMPT = `
Ты — Мусульманский пищевой технолог. Твоя цель — найти ХАРАМ.
Критерии: Свинина, Е120, Кармин, Алкоголь (как ингредиент), Желатин (не халяль).
Верни JSON: { "status": "HALAL"|"HARAM"|"MUSHBOOH", "reason": "Объяснение на русском", "ingredients_detected": ["список"] }
`;

const IMAM_PROMPT = `
Ты — Мудрый Муфтий (Ахлю Сунна). Твоя задача — помогать мусульманам.
Отвечай на вопросы по Исламу, опираясь на Коран и Сунну.
Будь краток, вежлив и конкретен.
Если вопрос про еду — скажи, дозволено это или нет.
Язык ответа: Русский (или Таджикский кириллицей, если спрашивают на нем).
`;

const DAILY_PROMPT = `Пришли 1 Аят или Хадис (Иман, Нравственность). JSON: {"arabic": "...", "translation": "...", "source": "..."}`;

// --- МАРШРУТЫ API ---

// 1. ПОИСК ПО БАЗЕ ТОВАРОВ
app.post('/api/barcode', async (req, res) => {
    try {
        const { code } = req.body;
        // Запрос в глобальную базу OpenFoodFacts
        const dbUrl = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
        const response = await fetch(dbUrl);
        const data = await response.json();

        if (data.status === 1) {
            const p = data.product;
            const name = p.product_name_ru || p.product_name || "Товар";
            const ings = p.ingredients_text_ru || p.ingredients_text_en || p.ingredients_text;
            const img = p.image_front_url;

            if (ings) {
                // Если есть состав — проверяем через ИИ
                const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
                const aiRes = await model.generateContent([ANALYZE_PROMPT, `Товар: ${name}. Состав: ${ings}`]);
                const text = aiRes.response.text().replace(/```json|```/g, '').trim();
                return res.json({ found: true, hasIngredients: true, name, image: img, ...JSON.parse(text) });
            } else {
                return res.json({ found: true, hasIngredients: false, name, image: img, reason: "Нет состава в базе." });
            }
        }
        res.json({ found: false });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// 2. АНАЛИЗ ФОТО
app.post('/api/photo', async (req, res) => {
    try {
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent([
            ANALYZE_PROMPT, 
            { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } }
        ]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) { res.status(500).json({ status: "ERROR" }); }
});

// 3. ЧАТ С ИМАМОМ (ИСПРАВЛЕНО!)
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        // ВАЖНО: Передаем systemInstruction именно так для новых версий библиотеки
        const model = getClient().getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: IMAM_PROMPT 
        });
        
        const result = await model.generateContent(message);
        const response = await result.response;
        res.json({ text: response.text() });
    } catch (error) {
        console.error("Ошибка чата:", error); // Увидишь ошибку в терминале
        res.status(500).json({ text: "Простите, сервер перегружен. Попробуйте через минуту." });
    }
});

// 4. ДЕНЬ
app.get('/api/daily', async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(DAILY_PROMPT);
        res.json(JSON.parse(result.response.text().replace(/```json|```/g, '').trim()));
    } catch (e) { res.json({ translation: "Аллах с терпеливыми.", arabic: "إِنَّ اللّهَ مَعَ الصَّابِرِينَ" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🕌 Halal Premium запущен на порту ${PORT}`));