const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args)); // Динамический импорт
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
// Промпт для анализа состава (текст или фото)
const ANALYZE_PROMPT = `
Ты — Мусульманский пищевой технолог. Проанализируй состав продукта.
Ищи: Свинину, Е120, Кармин, Алкоголь, Желатин (не халяль), Кошениль.

ВЕРНИ JSON:
{
  "status": "HALAL" | "HARAM" | "MUSHBOOH",
  "reason": "Краткое объяснение на русском",
  "haram_ingredients": ["список"]
}
`;

// --- API ---

// 1. ПОИСК ПО ШТРИХКОДУ (Мгновенный)
app.post('/api/barcode', async (req, res) => {
    try {
        const { code } = req.body;
        console.log("Ищем штрихкод:", code);

        // 1. Ищем в OpenFoodFacts (бесплатная мировая база)
        const dbUrl = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
        const dbRes = await fetch(dbUrl);
        const dbData = await dbRes.json();

        // Если товар найден в базе
        if (dbData.status === 1) {
            const product = dbData.product;
            const ingredients = product.ingredients_text_ru || product.ingredients_text_en || product.ingredients_text;
            const name = product.product_name_ru || product.product_name;

            if (!ingredients) {
                return res.json({ found: true, name: name, needsPhoto: true, reason: "Товар найден, но состав не указан. Сфотографируйте состав." });
            }

            // Отправляем состав ИИ на проверку
            const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent([ANALYZE_PROMPT, `Название: ${name}. Состав: ${ingredients}`]);
            const analysis = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());

            return res.json({ found: true, name: name, ...analysis });
        } 
        
        // Если товар НЕ найден
        else {
            return res.json({ found: false });
        }

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

// 2. АНАЛИЗ ФОТО (Если штрихкода нет)
app.post('/api/scan-photo', async (req, res) => {
    try {
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
        const imagePart = { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } };
        
        const result = await model.generateContent([ANALYZE_PROMPT, imagePart]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        res.status(500).json({ status: "ERROR", reason: "Не удалось распознать фото." });
    }
});

// 3. ЧАТ
const IMAM_PROMPT = "Ты — Муфтий. Отвечай на вопросы по Исламу (Коран, Сунна).";
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: IMAM_PROMPT });
        const result = await model.generateContent(message);
        res.json({ text: result.response.text() });
    } catch (e) { res.status(500).json({ text: "Ошибка." }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Halal App v2 на порту ${PORT}`));