const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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

// --- ПРАВИЛА ---
const ANALYZE_PROMPT = `
Ты — Мусульманский технолог. Найди в составе: Свинину, Е120, Кармин, Спирт, Желатин (не халяль).
Ответ JSON: { "status": "HALAL"|"HARAM"|"MUSHBOOH", "reason": "Объяснение", "ingredients_detected": ["список"] }
`;

// Упрощенный промпт для Имама, чтобы не ломался
const IMAM_INSTRUCTION = "Ты Муфтий. Отвечай кратко по Корану и Сунне. На таджикском отвечай кириллицей.";

// --- API ---

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        console.log("Вопрос Имаму:", message);
        
        const genAI = getClient();
        // Важное исправление: передаем инструкцию внутрь модели
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash",
            systemInstruction: IMAM_INSTRUCTION
        });

        const result = await model.generateContent(message);
        const response = await result.response;
        const text = response.text();
        
        res.json({ text: text });
    } catch (error) {
        console.error("Ошибка Имама:", error);
        res.status(500).json({ text: "Брат, сервер перегружен. Повтори вопрос." });
    }
});

app.post('/api/barcode', async (req, res) => {
    try {
        const { code } = req.body;
        // База OpenFoodFacts
        const dbUrl = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
        const response = await fetch(dbUrl);
        const data = await response.json();

        if (data.status === 1) {
            const p = data.product;
            const name = p.product_name_ru || p.product_name || "Товар";
            const ings = p.ingredients_text_ru || p.ingredients_text_en || p.ingredients_text;
            
            if (ings) {
                const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
                const aiRes = await model.generateContent([ANALYZE_PROMPT, `Состав: ${ings}`]);
                const text = aiRes.response.text().replace(/```json|```/g, '').trim();
                return res.json({ found: true, hasIngredients: true, name, ...JSON.parse(text) });
            } else {
                return res.json({ found: true, hasIngredients: false, name });
            }
        }
        res.json({ found: false });
    } catch (e) { res.status(500).json({ error: "Ошибка" }); }
});

app.post('/api/photo', async (req, res) => {
    try {
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

app.get('/api/daily', async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(`Пришли 1 Аят или Хадис. JSON: {"arabic": "...", "translation": "...", "source": "..."}`);
        res.json(JSON.parse(result.response.text().replace(/```json|```/g, '').trim()));
    } catch (e) { res.json({ translation: "Аллах с нами.", arabic: "الله معانا" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Run on ${PORT}`));