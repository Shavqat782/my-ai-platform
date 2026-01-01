/* HALAL GUIDE PREMIUM SERVER
   Backend: Node.js + Express + Google Gemini AI
   Features: Barcode Lookup, Photo Analysis, Islamic Fatwa Chat
*/

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// Если Node.js старый, раскомментируй строку ниже:
// const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const app = express();
// Увеличиваем лимит, чтобы HD фото загружались без проблем
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static('public'));

// --- КОНФИГУРАЦИЯ API ---
const apiKeys = [
    process.env.KEY1, process.env.KEY2, process.env.KEY3,
    process.env.KEY4, process.env.KEY5, process.env.KEY6
].filter(k => k);

function getClient() {
    const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    return new GoogleGenerativeAI(key);
}

// --- СИСТЕМНЫЕ ИНСТРУКЦИИ (PROMPTS) ---

// 1. АНАЛИЗАТОР СОСТАВА (ТЕХНОЛОГ)
const ANALYZE_PROMPT = `
Ты — Мусульманский эксперт по сертификации Халяль. Твоя задача — строгий анализ состава.
Критерии Харам (Запрещено):
1. Свинина (Pork, Bacon, Lard, Animal Fat без пометки Halal).
2. Кармин (E120, Carmine, Cochineal).
3. Алкоголь/Этанол (как ингредиент, а не технический).
4. Желатин (Gelatin) — если не указано "Fish", "Plant" или "Halal Beef", считай MUSHBOOH (Сомнительно).
5. Сычужный фермент (Rennet) — если не растительный/микробиальный.

ФОРМАТ ОТВЕТА (JSON ONLY):
{
  "status": "HALAL" | "HARAM" | "MUSHBOOH",
  "reason": "Краткое, но четкое объяснение на русском языке. Укажи конкретный ингредиент.",
  "ingredients_detected": ["E120", "Gelatin" и т.д.]
}
`;

// 2. ИМАМ (ЧАТ)
const IMAM_PROMPT = `
Ты — Муфтий, придерживающийся Ахлю Сунна валь-Джамаа. 
Отвечай на вопросы мусульман мудро, мягко и с доводами.
- Источники: Коран, Сунна (Кутуб ас-Ситта).
- Если вопрос бытовой — дай прямой ответ.
- Если вопрос сложный (фикх) — укажи, что лучше обратиться к живому ученому, но приведи общее мнение мазхабов.
- Язык: Если пишут на таджикском — отвечай на таджикском (кириллица).
`;

// 3. ХАДИС ДНЯ
const DAILY_PROMPT = `
Выбери ОДИН красивый и достоверный Хадис или Аят из Корана.
Темы: Нравственность, Терпение, Ризк, Благодарность Аллаху.
Верни JSON:
{
  "arabic": "Текст на арабском",
  "translation": "Красивый перевод на русский",
  "source": "Например: Сура 2:155 или Сахих Бухари 102"
}
`;

// --- API ROUTES ---

// 1. АНАЛИЗ ПО ШТРИХКОДУ
app.post('/api/barcode', async (req, res) => {
    try {
        const { code } = req.body;
        console.log(`🔍 Сканируем штрихкод: ${code}`);

        // Запрос к OpenFoodFacts
        const dbUrl = `https://world.openfoodfacts.org/api/v0/product/${code}.json`;
        const response = await fetch(dbUrl);
        const data = await response.json();

        // Товар найден?
        if (data.status === 1) {
            const product = data.product;
            const name = product.product_name_ru || product.product_name || "Товар без названия";
            const ingredients = product.ingredients_text_ru || product.ingredients_text_en || product.ingredients_text;
            const imageUrl = product.image_front_url;

            // Если состав есть в базе — проверяем его через ИИ
            if (ingredients) {
                const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
                const aiRes = await model.generateContent([
                    ANALYZE_PROMPT, 
                    `Продукт: ${name}. Состав: ${ingredients}`
                ]);
                const text = aiRes.response.text().replace(/```json|```/g, '').trim();
                const analysis = JSON.parse(text);

                return res.json({
                    found: true,
                    hasIngredients: true,
                    name: name,
                    image: imageUrl,
                    ...analysis
                });
            } else {
                // Товар есть, но состава нет — нужно фото
                return res.json({
                    found: true,
                    hasIngredients: false,
                    name: name,
                    image: imageUrl,
                    reason: "В базе нет состава этого товара. Пожалуйста, сфотографируйте этикетку."
                });
            }
        } else {
            // Товара нет в базе вообще
            return res.json({ found: false });
        }
    } catch (error) {
        console.error("Ошибка штрихкода:", error);
        res.status(500).json({ error: "Ошибка сервера при поиске." });
    }
});

// 2. АНАЛИЗ ПО ФОТО (Если штрихкод не помог)
app.post('/api/photo', async (req, res) => {
    try {
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const imagePart = {
            inlineData: {
                data: image.split(',')[1],
                mimeType: "image/jpeg"
            }
        };

        const result = await model.generateContent([ANALYZE_PROMPT, imagePart]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (error) {
        console.error("Ошибка фото:", error);
        res.status(500).json({ status: "ERROR", reason: "Не удалось распознать текст на фото." });
    }
});

// 3. ЧАТ С ИМАМОМ
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const model = getClient().getGenerativeModel({ 
            model: "gemini-1.5-flash", 
            systemInstruction: IMAM_PROMPT 
        });
        const result = await model.generateContent(message);
        res.json({ text: result.response.text() });
    } catch (error) {
        res.status(500).json({ text: "Извините, сейчас связь с сервером прервалась." });
    }
});

// 4. ДНЕВНОЙ ХАДИС
app.get('/api/daily', async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(DAILY_PROMPT);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (error) {
        // Запасной вариант, если ИИ спит
        res.json({
            arabic: "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ",
            translation: "Поистине, дела оцениваются только по намерениям.",
            source: "Сахих аль-Бухари"
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Halal Premium Server running on port ${PORT}`));