const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Используем встроенный fetch или подключаем динамически
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

const apiKeys = [
    process.env.KEY1, process.env.KEY2, process.env.KEY3,
    process.env.KEY4, process.env.KEY5, process.env.KEY6
].filter(k => k);

function getClient() {
    return new GoogleGenerativeAI(apiKeys[Math.floor(Math.random() * apiKeys.length)]);
}

// --- ПРОМПТЫ ---
const ANALYZE_PROMPT = `
Ты — Мусульманский пищевой технолог. Проанализируй состав.
Ищи: Свинину, Е120, Кармин, Алкоголь, Желатин (не халяль), Кошениль.
ВЕРНИ JSON:
{
  "status": "HALAL" | "HARAM" | "MUSHBOOH",
  "reason": "Краткое объяснение на русском",
  "ingredients": "список подозрительного"
}
`;

const IMAM_PROMPT = `Ты — Муфтий (Ахлю Сунна). Отвечай на вопросы по Исламу (Коран, Сунна). Если вопрос на таджикском — отвечай на таджикском (кириллица).`;

const DAILY_PROMPT = `Пришли 1 Аят или Хадис. Тема: Иман, Нравственность. Формат JSON: {"arabic": "...", "translation": "...", "source": "..."}`;

// --- API ---

// 1. АНАЛИЗ ШТРИХКОДА
app.post('/api/barcode', async (req, res) => {
    try {
        const { code } = req.body;
        // База OpenFoodFacts
        const dbUrl = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
        const dbRes = await fetch(dbUrl);
        const dbData = await dbRes.json();

        if (dbData.status === 1) {
            const product = dbData.product;
            const name = product.product_name_ru || product.product_name || "Товар найден";
            const ingredients = product.ingredients_text_ru || product.ingredients_text_en || product.ingredients_text;

            if (!ingredients) {
                // Товар есть, но состава нет в базе
                return res.json({ found: true, hasIngredients: false, name: name });
            }

            // Анализируем состав через Gemini
            const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent([ANALYZE_PROMPT, `Товар: ${name}. Состав: ${ingredients}`]);
            const text = result.response.text().replace(/```json|```/g, '').trim();
            const analysis = JSON.parse(text);

            return res.json({ found: true, hasIngredients: true, name: name, ...analysis });
        } else {
            return res.json({ found: false });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Ошибка" });
    }
});

// 2. АНАЛИЗ ФОТО
app.post('/api/scan-photo', async (req, res) => {
    try {
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } };
        const result = await model.generateContent([ANALYZE_PROMPT, imagePart]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) { res.status(500).json({ status: "ERROR" }); }
});

// 3. ЧАТ и ДЕНЬ
app.post('/api/chat', async (req, res) => {
    const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: IMAM_PROMPT });
    const result = await model.generateContent(req.body.message);
    res.json({ text: result.response.text() });
});

app.get('/api/daily', async (req, res) => {
    const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(DAILY_PROMPT);
    res.json(JSON.parse(result.response.text().replace(/```json|```/g, '').trim()));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🕌 Halal App (Premium) на порту ${PORT}`));