require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Gemini API Keys
const geminiKeys = [
  process.env.KEY1,
  process.env.KEY2,
  process.env.KEY3,
  process.env.KEY4,
  process.env.KEY5,
  process.env.KEY6
].filter(key => key && key.length > 5);

let currentKeyIndex = 0;

function getNextGeminiKey() {
  if (geminiKeys.length === 0) {
    throw new Error('No Gemini API keys configured');
  }
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
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2000
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      if (response.data.candidates && response.data.candidates[0]) {
        return response.data.candidates[0].content.parts[0].text;
      }
    } catch (error) {
      console.log(`Key ${currentKeyIndex} failed: ${error.message}`);
      continue;
    }
  }
  throw new Error('All Gemini API keys failed');
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    keys: geminiKeys.length,
    message: 'Halal Scanner API is running'
  });
});

// Check barcode
app.post('/api/check-barcode', async (req, res) => {
  try {
    const { barcode } = req.body;
    
    if (!barcode) {
      return res.status(400).json({ success: false, message: 'Barcode is required' });
    }
    
    const prompt = `Analyze product with barcode ${barcode}. 
    Determine if it's halal or haram for Muslims.
    Consider ingredients, manufacturing process, and Islamic dietary laws.
    
    Format response as JSON:
    {
      "name": "product name or 'Unknown Product'",
      "halalStatus": "halal/haram/mashbooh/unknown",
      "ingredients": ["list if known"],
      "description": "detailed explanation",
      "verification": "AI analysis"
    }`;
    
    const geminiResponse = await analyzeWithGemini(prompt);
    
    try {
      const productInfo = JSON.parse(geminiResponse);
      res.json({
        success: true,
        product: {
          barcode,
          ...productInfo
        }
      });
    } catch (e) {
      // If not valid JSON, return as description
      res.json({
        success: true,
        product: {
          barcode,
          name: 'Product Analysis',
          halalStatus: 'unknown',
          description: geminiResponse,
          verification: 'AI analysis'
        }
      });
    }
  } catch (error) {
    console.error('Barcode check error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
});

// Check ingredients from text
app.post('/api/check-ingredients', async (req, res) => {
  try {
    const { ingredientsText } = req.body;
    
    if (!ingredientsText) {
      return res.status(400).json({ success: false, message: 'Ingredients text is required' });
    }
    
    const prompt = `Analyze these ingredients and determine if product is halal or haram for Muslims:
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
      "ingredients": ["parsed ingredients"],
      "riskyIngredients": ["list of potentially haram ingredients"],
      "description": "detailed explanation with Islamic rulings",
      "verification": "AI text analysis"
    }`;
    
    const geminiResponse = await analyzeWithGemini(prompt);
    
    try {
      const analysis = JSON.parse(geminiResponse);
      res.json({ success: true, analysis });
    } catch (e) {
      res.json({
        success: true,
        analysis: {
          halalStatus: 'unknown',
          description: geminiResponse,
          verification: 'AI analysis'
        }
      });
    }
  } catch (error) {
    console.error('Ingredients check error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Chat with Imam
app.post('/api/ask-imam', async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ success: false, message: 'Question is required' });
    }
    
    const prompt = `You are an Islamic scholar (Imam) answering questions about Islam.
    Question: ${question}
    
    Provide a detailed, authentic Islamic response based on Quran and Sunnah.
    Include relevant Quranic verses and Hadith if applicable.
    If the question is about halal/haram food, provide specific rulings.
    
    Keep response clear and organized.`;
    
    const response = await analyzeWithGemini(prompt);
    
    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error('Imam chat error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Find mosques and qibla direction
app.post('/api/find-mosques', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }
    
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
          "distance": "approx distance",
          "address": "general address"
        }
      ],
      "instructions": "prayer and qibla instructions"
    }`;
    
    const geminiResponse = await analyzeWithGemini(prompt);
    
    try {
      const mosqueInfo = JSON.parse(geminiResponse);
      res.json({ success: true, ...mosqueInfo });
    } catch (e) {
      res.json({
        success: true,
        location: { latitude, longitude },
        qiblaDirection: "Calculate manually",
        instructions: "Use compass app for Qibla direction"
      });
    }
  } catch (error) {
    console.error('Mosque find error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Simple authentication (for demo purposes)
const users = {};

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  
  if (users[username]) {
    return res.status(400).json({ success: false, message: 'User already exists' });
  }
  
  users[username] = { password, createdAt: new Date() };
  
  res.json({ 
    success: true, 
    message: 'User registered successfully',
    token: `demo-token-${username}`
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  
  const user = users[username];
  
  if (!user || user.password !== password) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  
  res.json({ 
    success: true, 
    message: 'Login successful',
    token: `demo-token-${username}`
  });
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Available Gemini keys: ${geminiKeys.length}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});