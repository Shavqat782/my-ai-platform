const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' })); // Чтобы фото загружались
app.use(cors());
app.use(express.static('public'));

// Ротация ключей (твоя фишка)
const apiKeys = [
    process.env.KEY1, process.env.KEY2, process.env.KEY3,
    process.env.KEY4, process.env.KEY5, process.env.KEY6
].filter(k => k);

function getClient() {
    const key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    return new GoogleGenerativeAI(key);
}

// --- ПРОМПТЫ (ИНСТРУКЦИИ) ---

// 1. ПРОМПТ ДЛЯ СКАНЕРА (Строгий анализ состава)
const SCAN_PROMPT = `
Ты — эксперт по стандартизации Халяль (Halal) и пищевой химик. 
Твоя задача — проанализировать фото товара (состав, штрихкод, внешний вид).

КРИТЕРИИ ЗАПРЕТНОГО (HARAM):
- Свинина (Pork, Ham, Bacon, Lard, Gelatin если не указан Halal/Bovine).
- Алкоголь (Alcohol, Ethanol, Wine, Rum, Brandy) — если используется как ингредиент, а не технический спирт.
- Кармин (E120, Carmine, Cochineal).
- Шеллак (E904).
- L-cysteine (E920) — если из волос человека/свиньи.
- Сычужный фермент (Rennet) — если животный и не Халяль.
- Мясо не по шариату.

ФОРМАТ ОТВЕТА (JSON):
{
  "status": "HALAL" (Зеленый) | "HARAM" (Красный) | "MUSHBOOH" (Желтый/Сомнительно),
  "title": "Название продукта (если видишь)",
  "reason": "Четкое объяснение. Если Харам — напиши, какой именно ингредиент. Если Машбух — напиши, что нужно уточнить (например, источник желатина).",
  "ingredients": "Список подозрительных компонентов"
}
Если текст не читается, верни статус "ERROR".
`;

// 2. ПРОМПТ ДЛЯ ЧАТА (Муфтий)
const CHAT_PROMPT = `
Ты — Исламский ученый (Муфтий), следующий пути Ахлю Сунна валь-Джамаа.
Твоя методология вынесения решений:
1. Коран (Аяты).
2. Достоверная Сунна (Хадисы из Бухари, Муслима и др.).
3. Иджма (Единогласное мнение сподвижников).
4. Кыяс (Суждение по аналогии, если вопрос современный).

Ссылайся на 4 мазхаба (Ханафи, Шафии, Малики, Ханбали), если есть разногласия.
Будь вежлив, мудр и краток. Не философствуй.
Если вопрос на таджикском — отвечай на таджикском (кириллица).
`;

// 3. ПРОМПТ ДЛЯ "ХАДИСА ДНЯ"
const DAILY_PROMPT = `
Пришли один вдохновляющий Аят из Корана (с номером суры) ИЛИ один достоверный Хадис (с источником).
Тема: Нравственность, Терпение, Ризк, Очищение сердца или Халяль.
Ответ верни в формате JSON:
{
  "type": "AYAT" или "HADITH",
  "arabic": "Текст на арабском",
  "translation": "Перевод на русский",
  "source": "Например: Сура Аль-Бакара 2:155 или Сахих Бухари 50"
}
`;

// --- ЭНДПОИНТЫ ---

// Сканирование
app.post('/api/scan', async (req, res) => {
    try {
        const { image } = req.body;
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const imagePart = { inlineData: { data: image.split(',')[1], mimeType: "image/jpeg" } };
        const result = await model.generateContent([SCAN_PROMPT, imagePart]);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) {
        console.error(e);
        res.status(500).json({ status: "ERROR", reason: "Не удалось распознать фото." });
    }
});

// Чат с Муфтием
app.post('/api/chat', async (req, res) => {
    try {
        const { message, history } = req.body; // history можно добавить позже для контекста
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash", systemInstruction: CHAT_PROMPT });
        const result = await model.generateContent(message);
        res.json({ text: result.response.text() });
    } catch (e) { res.status(500).json({ text: "Ошибка связи." }); }
});

// Хадис дня
app.get('/api/daily', async (req, res) => {
    try {
        const model = getClient().getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(DAILY_PROMPT);
        const text = result.response.text().replace(/```json|```/g, '').trim();
        res.json(JSON.parse(text));
    } catch (e) { res.json({ type: "HADITH", translation: "Дела оцениваются по намерениям.", source: "Бухари", arabic: "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Halal App запущен на ${PORT}`));