require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Product Schema
const productSchema = new mongoose.Schema({
  barcode: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  brand: String,
  category: String,
  halalStatus: { 
    type: String, 
    enum: ['halal', 'haram', 'mashbooh', 'unknown'], 
    required: true 
  },
  ingredients: [String],
  description: String,
  verifiedBy: String,
  lastUpdated: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', productSchema);

// Gemini API Keys Rotation
const geminiKeys = [
  process.env.KEY1,
  process.env.KEY2,
  process.env.KEY3,
  process.env.KEY4,
  process.env.KEY5,
  process.env.KEY6
].filter(key => key && key.length > 10);

let currentKeyIndex = 0;

function getNextGeminiKey() {
  const key = geminiKeys[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % geminiKeys.length;
  return key;
}

// Gemini AI Functions
async function analyzeWithGemini(prompt) {
  for (let i = 0; i < geminiKeys.length; i++) {
    try {
      const apiKey = getNextGeminiKey();
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
        {
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.log(`Key ${currentKeyIndex} failed, trying next...`);
      continue;
    }
  }
  throw new Error('All Gemini API keys failed');
}

// Routes
// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Product Routes
app.post('/api/check-barcode', async (req, res) => {
  try {
    const { barcode } = req.body;
    
    // Check in database first
    const product = await Product.findOne({ barcode });
    if (product) {
      return res.json({
        success: true,
        found: true,
        product,
        source: 'database'
      });
    }
    
    // If not found, use Gemini to analyze
    const prompt = `Analyze product with barcode ${barcode}. 
    Determine if it's halal or haram for Muslims.
    Consider ingredients, manufacturing process, and Islamic dietary laws.
    If you don't know, say "unknown".
    
    Format response as JSON:
    {
      "name": "product name",
      "halalStatus": "halal/haram/mashbooh/unknown",
      "ingredients": ["ing1", "ing2"],
      "description": "detailed explanation",
      "verification": "AI analysis"
    }`;
    
    const geminiResponse = await analyzeWithGemini(prompt);
    const productInfo = JSON.parse(geminiResponse);
    
    // Save to database
    const newProduct = new Product({
      barcode,
      ...productInfo
    });
    await newProduct.save();
    
    res.json({
      success: true,
      found: false,
      product: newProduct,
      source: 'gemini'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/check-ingredients', async (req, res) => {
  try {
    const { imageBase64, ingredientsText } = req.body;
    
    let prompt = '';
    if (imageBase64) {
      prompt = `Analyze this product image and determine if it's halal or haram for Muslims.
      Look at ingredients list, certifications, and packaging information.
      If you can't determine, say "mashbooh" (doubtful).
      
      Format response as JSON:
      {
        "name": "product name if visible",
        "halalStatus": "halal/haram/mashbooh/unknown",
        "ingredients": ["list of ingredients"],
        "description": "detailed explanation",
        "verification": "AI image analysis"
      }`;
    } else if (ingredientsText) {
      prompt = `Analyze these ingredients and determine if product is halal or haram for Muslims:
      "${ingredientsText}"
      
      Pay special attention to:
      - Pork and derivatives
      - Alcohol
      - Animal enzymes
      - Gelatin sources
      - E-numbers of animal origin
      
      Format response as JSON:
      {
        "halalStatus": "halal/haram/mashbooh/unknown",
        "ingredients": ["parsed ingredients list"],
        "riskyIngredients": ["list of potentially haram ingredients"],
        "description": "detailed explanation with Islamic rulings",
        "verification": "AI text analysis"
      }`;
    }
    
    const geminiResponse = await analyzeWithGemini(prompt);
    const analysis = JSON.parse(geminiResponse);
    
    res.json({
      success: true,
      analysis
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Chat with Imam
app.post('/api/ask-imam', async (req, res) => {
  try {
    const { question } = req.body;
    
    const prompt = `You are an Islamic scholar (Imam) answering questions about Islam.
    Question: ${question}
    
    Provide a detailed, authentic Islamic response based on Quran and Sunnah.
    Include relevant Quranic verses and Hadith if applicable.
    If the question is about halal/haram food, provide specific rulings.
    
    Format your response in Markdown with clear sections.`;
    
    const response = await analyzeWithGemini(prompt);
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Find Nearby Mosques
app.post('/api/find-mosques', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    const prompt = `Given coordinates latitude ${latitude}, longitude ${longitude},
    provide information about nearby mosques and Islamic centers.
    Also calculate Qibla direction from this location to Mecca.
    
    Format response as JSON:
    {
      "location": {
        "latitude": ${latitude},
        "longitude": ${longitude}
      },
      "qiblaDirection": "degrees from north",
      "prayerDirections": {
        "fajr": "direction",
        "dhuhr": "direction",
        "asr": "direction",
        "maghrib": "direction",
        "isha": "direction"
      },
      "nearbyMosques": [
        {
          "name": "mosque name",
          "distance": "approx distance in km",
          "address": "address if known"
        }
      ],
      "instructions": "prayer and qibla instructions"
    }`;
    
    const response = await analyzeWithGemini(prompt);
    const mosqueInfo = JSON.parse(response);
    
    res.json({
      success: true,
      ...mosqueInfo
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Scanner Route
app.post('/api/scan-product', async (req, res) => {
  try {
    const { barcode, imageBase64 } = req.body;
    
    if (barcode) {
      // Handle barcode scan
      return await handleBarcodeScan(req, res);
    } else if (imageBase64) {
      // Handle image scan
      return await handleImageScan(req, res);
    } else {
      res.status(400).json({ success: false, message: 'No barcode or image provided' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

async function handleBarcodeScan(req, res) {
  const { barcode } = req.body;
  
  // Check database first
  const product = await Product.findOne({ barcode });
  if (product) {
    return res.json({
      success: true,
      type: 'barcode',
      product,
      message: `Product: ${product.name}\nStatus: ${product.halalStatus.toUpperCase()}`
    });
  }
  
  // Use external API or Gemini for barcode lookup
  const prompt = `Look up product with barcode ${barcode}. 
  Provide product name and analyze if halal or haram for Muslims.
  If unknown, say so.`;
  
  try {
    const geminiResponse = await analyzeWithGemini(prompt);
    const productInfo = {
      barcode,
      name: `Product ${barcode}`,
      halalStatus: 'unknown',
      description: geminiResponse
    };
    
    res.json({
      success: true,
      type: 'barcode',
      product: productInfo,
      message: `Product found via AI analysis`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function handleImageScan(req, res) {
  const { imageBase64 } = req.body;
  
  const prompt = `Analyze this product image for halal/haram status.
  Look at ingredients list, certifications (halal logos), and packaging.
  Provide detailed analysis in JSON format.`;
  
  try {
    const geminiResponse = await analyzeWithGemini(prompt);
    const analysis = JSON.parse(geminiResponse);
    
    res.json({
      success: true,
      type: 'image',
      analysis,
      message: `Image analyzed: Status - ${analysis.halalStatus || 'unknown'}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Available Gemini keys: ${geminiKeys.length}`);
});