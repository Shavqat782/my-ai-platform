// Global variables
let currentUser = null;
let barcodeScanner = null;
let currentLocation = null;
let scanHistory = JSON.parse(localStorage.getItem('scanHistory')) || [];

// DOM Elements
const authSection = document.getElementById('authSection');
const scannerSection = document.getElementById('scannerSection');
const barcodeInput = document.getElementById('barcodeInput');
const ingredientsInput = document.getElementById('ingredientsInput');
const questionInput = document.getElementById('questionInput');
const resultsSection = document.getElementById('resultsSection');
const resultCard = document.getElementById('resultCard');
const productInfo = document.getElementById('productInfo');
const halalStatus = document.getElementById('halalStatus');
const ingredientsList = document.getElementById('ingredientsList');
const explanation = document.getElementById('explanation');
const statusIndicator = document.getElementById('statusIndicator');
const chatMessages = document.getElementById('chatMessages');
const locationInfo = document.getElementById('locationInfo');
const qiblaCompass = document.getElementById('qiblaCompass');
const compassArrow = document.getElementById('compassArrow');
const compassDegree = document.getElementById('compassDegree');
const qiblaInfo = document.getElementById('qiblaInfo');
const mosquesList = document.getElementById('mosquesList');
const historyList = document.getElementById('historyList');
const uploadArea = document.getElementById('uploadArea');
const imageUpload = document.getElementById('imageUpload');

// API Base URL
const API_BASE_URL = window.location.origin;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupEventListeners();
    
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        verifyToken(token);
    }
});

// Event Listeners
function setupEventListeners() {
    // Barcode scanner input
    barcodeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            scanBarcode();
        }
    });
    
    // Image upload
    uploadArea.addEventListener('click', () => {
        imageUpload.click();
    });
    
    imageUpload.addEventListener('change', handleImageUpload);
    
    // Drag and drop for image upload
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#1a5fb4';
        uploadArea.style.backgroundColor = '#f8f9ff';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#e0e0e0';
        uploadArea.style.backgroundColor = '';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#e0e0e0';
        uploadArea.style.backgroundColor = '';
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            processImage(file);
        }
    });
    
    // Auto-detect location on mosque tab
    document.querySelector('.tab[onclick*="mosque"]').addEventListener('click', () => {
        if (!currentLocation) {
            getLocation();
        }
    });
}

// Authentication Functions
async function register() {
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (password !== confirmPassword) {
        showMessage('Пароли не совпадают', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Регистрация успешна! Теперь войдите в систему.', 'success');
            switchAuthTab('login');
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером', 'error');
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('token', data.token);
            currentUser = { username };
            showScannerSection();
            showMessage(`Добро пожаловать, ${username}!`, 'success');
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером', 'error');
    }
}

async function verifyToken(token) {
    try {
        // Simple token verification by trying to access protected endpoint
        const response = await fetch(`${API_BASE_URL}/api/check-barcode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ barcode: 'test' })
        });
        
        if (response.status !== 401) {
            currentUser = { username: 'User' };
            showScannerSection();
        }
    } catch (error) {
        // Token invalid or expired
        localStorage.removeItem('token');
    }
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    checkAuthStatus();
    showMessage('Вы вышли из системы', 'success');
}

// UI Navigation Functions
function checkAuthStatus() {
    if (currentUser) {
        authSection.style.display = 'none';
        scannerSection.style.display = 'block';
    } else {
        authSection.style.display = 'block';
        scannerSection.style.display = 'none';
    }
}

function showScannerSection() {
    authSection.style.display = 'none';
    scannerSection.style.display = 'block';
    switchTab('scanner');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');
    
    if (tab === 'login') {
        document.querySelector('.auth-tab[onclick*="login"]').classList.add('active');
        document.getElementById('loginForm').style.display = 'flex';
    } else {
        document.querySelector('.auth-tab[onclick*="register"]').classList.add('active');
        document.getElementById('registerForm').style.display = 'flex';
    }
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Activate selected tab
    document.querySelector(`.tab[onclick*="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    // Load content for specific tabs
    if (tabName === 'history') {
        loadHistory();
    } else if (tabName === 'mosque') {
        if (!currentLocation) {
            getLocation();
        }
    }
}

// Barcode Scanner Functions
async function scanBarcode() {
    const barcode = barcodeInput.value.trim();
    
    if (!barcode) {
        showMessage('Введите штрих-код', 'error');
        return;
    }
    
    showLoading('Анализ штрих-кода...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/check-barcode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ barcode })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayScanResult(data.product, data.source);
            
            // Add to history
            addToHistory({
                type: 'barcode',
                barcode,
                product: data.product,
                timestamp: new Date().toISOString()
            });
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Ошибка при сканировании', 'error');
    }
}

function startBarcodeScanner() {
    if (!('Quagga' in window)) {
        showMessage('Библиотека сканера не загружена', 'error');
        return;
    }
    
    const video = document.getElementById('scannerVideo');
    const canvas = document.getElementById('scannerCanvas');
    const placeholder = document.querySelector('.camera-placeholder');
    
    placeholder.style.display = 'none';
    video.style.display = 'block';
    
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: video,
            constraints: {
                facingMode: "environment"
            }
        },
        decoder: {
            readers: [
                "ean_reader",
                "ean_8_reader",
                "code_128_reader",
                "code_39_reader",
                "upc_reader",
                "upc_e_reader"
            ]
        }
    }, function(err) {
        if (err) {
            console.error(err);
            showMessage('Ошибка инициализации сканера', 'error');
            return;
        }
        
        Quagga.start();
        
        // Add frame processor
        Quagga.onProcessed(function(result) {
            if (result) {
                const ctx = canvas.getContext('2d');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);
                
                if (result.boxes) {
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 3;
                    result.boxes.forEach(box => {
                        ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
                    });
                }
            }
        });
        
        // Detect barcode
        Quagga.onDetected(function(result) {
            const code = result.codeResult.code;
            barcodeInput.value = code;
            stopBarcodeScanner();
            scanBarcode();
        });
    });
}

function stopBarcodeScanner() {
    if (Quagga) {
        Quagga.stop();
    }
    
    const video = document.getElementById('scannerVideo');
    const placeholder = document.querySelector('.camera-placeholder');
    
    video.style.display = 'none';
    placeholder.style.display = 'block';
}

// Image Processing Functions
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        processImage(file);
    }
}

async function processImage(file) {
    showLoading('Анализ изображения...');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        const imageBase64 = e.target.result.split(',')[1];
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/check-ingredients`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
                },
                body: JSON.stringify({ imageBase64 })
            });
            
            const data = await response.json();
            
            if (data.success) {
                displayImageAnalysisResult(data.analysis);
                
                // Add to history
                addToHistory({
                    type: 'image',
                    analysis: data.analysis,
                    timestamp: new Date().toISOString()
                });
            } else {
                showMessage(data.message, 'error');
            }
        } catch (error) {
            showMessage('Ошибка при анализе изображения', 'error');
        }
    };
    
    reader.readAsDataURL(file);
}

async function captureImage() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showMessage('Камера не доступна', 'error');
        return;
    }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        
        // Create canvas and capture image
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        
        // Stop video stream
        stream.getTracks().forEach(track => track.stop());
        
        // Convert to base64 and process
        const imageBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
        
        showLoading('Анализ фотографии...');
        
        const response = await fetch(`${API_BASE_URL}/api/check-ingredients`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ imageBase64 })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayImageAnalysisResult(data.analysis);
            
            // Add to history
            addToHistory({
                type: 'image',
                analysis: data.analysis,
                timestamp: new Date().toISOString()
            });
        } else {
            showMessage(data.message, 'error');
        }
        
    } catch (error) {
        showMessage('Ошибка при использовании камеры', 'error');
    }
}

// Ingredients Check
async function checkIngredients() {
    const text = ingredientsInput.value.trim();
    
    if (!text) {
        showMessage('Введите состав продукта', 'error');
        return;
    }
    
    showLoading('Анализ состава...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/check-ingredients`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ ingredientsText: text })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayIngredientsAnalysisResult(data.analysis);
            
            // Add to history
            addToHistory({
                type: 'text',
                text,
                analysis: data.analysis,
                timestamp: new Date().toISOString()
            });
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Ошибка при анализе состава', 'error');
    }
}

// Display Results Functions
function displayScanResult(product, source) {
    updateStatusIndicator(product.halalStatus);
    
    productInfo.innerHTML = `
        <h4>${product.name || 'Неизвестный продукт'}</h4>
        <p><strong>Штрих-код:</strong> ${product.barcode}</p>
        <p><strong>Источник:</strong> ${source === 'database' ? 'База данных' : 'AI анализ'}</p>
        <p><strong>Бренд:</strong> ${product.brand || 'Не указан'}</p>
    `;
    
    updateHalalStatus(product.halalStatus);
    
    if (product.ingredients && product.ingredients.length > 0) {
        ingredientsList.innerHTML = `
            <h4>Состав:</h4>
            <ul>${product.ingredients.map(ing => `<li>${ing}</li>`).join('')}</ul>
        `;
    } else {
        ingredientsList.innerHTML = `
            <h4>Состав:</h4>
            <p>Не указан</p>
        `;
    }
    
    explanation.innerHTML = `
        <h4>Объяснение:</h4>
        <p>${product.description || 'Нет дополнительной информации'}</p>
        ${product.verification ? `<p><em>${product.verification}</em></p>` : ''}
    `;
    
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function displayImageAnalysisResult(analysis) {
    updateStatusIndicator(analysis.halalStatus);
    
    productInfo.innerHTML = `
        <h4>${analysis.name || 'Продукт на фото'}</h4>
        <p><strong>Тип анализа:</strong> Анализ изображения</p>
    `;
    
    updateHalalStatus(analysis.halalStatus);
    
    if (analysis.ingredients && analysis.ingredients.length > 0) {
        ingredientsList.innerHTML = `
            <h4>Обнаруженные ингредиенты:</h4>
            <ul>${analysis.ingredients.slice(0, 10).map(ing => `<li>${ing}</li>`).join('')}</ul>
        `;
    }
    
    explanation.innerHTML = `
        <h4>Анализ:</h4>
        <p>${analysis.description || 'Нет дополнительной информации'}</p>
        ${analysis.riskyIngredients ? `
            <h4>Рискованные ингредиенты:</h4>
            <ul>${analysis.riskyIngredients.map(ing => `<li class="danger">${ing}</li>`).join('')}</ul>
        ` : ''}
    `;
    
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function displayIngredientsAnalysisResult(analysis) {
    updateStatusIndicator(analysis.halalStatus);
    
    productInfo.innerHTML = `
        <h4>Анализ текстового состава</h4>
        <p><strong>Тип анализа:</strong> Текстовый анализ</p>
    `;
    
    updateHalalStatus(analysis.halalStatus);
    
    ingredientsList.innerHTML = `
        <h4>Проанализированные ингредиенты:</h4>
        <p>${ingredientsInput.value.substring(0, 200)}...</p>
    `;
    
    explanation.innerHTML = `
        <h4>Анализ:</h4>
        <p>${analysis.description || 'Нет дополнительной информации'}</p>
        ${analysis.riskyIngredients && analysis.riskyIngredients.length > 0 ? `
            <h4>Потенциально харам ингредиенты:</h4>
            <ul>${analysis.riskyIngredients.map(ing => `<li class="danger">${ing}</li>`).join('')}</ul>
        ` : ''}
    `;
    
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function updateStatusIndicator(status) {
    const statusDot = statusIndicator.querySelector('.status-dot');
    const statusText = statusIndicator.querySelector('.status-text');
    
    statusDot.className = 'status-dot';
    statusText.textContent = status.toUpperCase();
    
    switch(status) {
        case 'halal':
            statusDot.classList.add('online');
            break;
        case 'haram':
            statusDot.classList.add('offline');
            break;
        case 'mashbooh':
            statusDot.classList.add('warning');
            break;
        default:
            statusDot.style.background = '#808080';
    }
}

function updateHalalStatus(status) {
    halalStatus.className = 'halal-status';
    
    let icon, text, additionalClass;
    
    switch(status) {
        case 'halal':
            icon = 'fas fa-check-circle';
            text = 'ХАЛЯЛЬ';
            additionalClass = 'status-halal';
            break;
        case 'haram':
            icon = 'fas fa-times-circle';
            text = 'ХАРАМ';
            additionalClass = 'status-haram';
            break;
        case 'mashbooh':
            icon = 'fas fa-exclamation-triangle';
            text = 'МАШБУХ (Сомнительно)';
            additionalClass = 'status-mashbooh';
            break;
        default:
            icon = 'fas fa-question-circle';
            text = 'НЕИЗВЕСТНО';
            additionalClass = 'status-unknown';
    }
    
    halalStatus.classList.add(additionalClass);
    halalStatus.innerHTML = `
        <i class="${icon}"></i>
        <h3>${text}</h3>
        <p>Данный продукт классифицирован как <strong>${text}</strong></p>
    `;
}

// Chat with Imam Functions
async function askImam() {
    const question = questionInput.value.trim();
    
    if (!question) {
        showMessage('Введите ваш вопрос', 'error');
        return;
    }
    
    // Add user message to chat
    addChatMessage(question, 'user');
    questionInput.value = '';
    
    // Show loading
    const loadingId = addLoadingMessage();
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/ask-imam`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ question })
        });
        
        const data = await response.json();
        
        // Remove loading message
        removeLoadingMessage(loadingId);
        
        if (data.success) {
            addChatMessage(data.response, 'imam');
        } else {
            addChatMessage('Извините, произошла ошибка. Пожалуйста, попробуйте еще раз.', 'imam');
        }
    } catch (error) {
        removeLoadingMessage(loadingId);
        addChatMessage('Ошибка соединения. Проверьте интернет и попробуйте снова.', 'imam');
    }
    
    // Scroll to bottom of chat
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addChatMessage(content, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const header = sender === 'imam' 
        ? '<div class="message-header"><i class="fas fa-user-tie"></i><strong>Имам:</strong></div>'
        : '<div class="message-header"><i class="fas fa-user"></i><strong>Вы:</strong></div>';
    
    messageDiv.innerHTML = `
        ${header}
        <div class="message-content">${content}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
}

function addLoadingMessage() {
    const id = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = id;
    loadingDiv.className = 'message imam loading';
    loadingDiv.innerHTML = `
        <div class="message-header">
            <i class="fas fa-user-tie"></i>
            <strong>Имам:</strong>
        </div>
        <div class="message-content">
            <i class="fas fa-spinner fa-spin"></i> Думаю над ответом...
        </div>
    `;
    
    chatMessages.appendChild(loadingDiv);
    return id;
}

function removeLoadingMessage(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

// Location and Mosque Functions
function getLocation() {
    if (!navigator.geolocation) {
        locationInfo.innerHTML = '<p class="error">Геолокация не поддерживается вашим браузером</p>';
        return;
    }
    
    locationInfo.innerHTML = '<p><i class="fas fa-sync-alt fa-spin"></i> Определение местоположения...</p>';
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            
            displayLocationInfo(currentLocation);
            await findNearbyMosques(currentLocation);
            calculateQiblaDirection(currentLocation);
        },
        (error) => {
            let message = 'Не удалось определить местоположение';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    message = 'Доступ к геолокации запрещен';
                    break;
                case error.POSITION_UNAVAILABLE:
                    message = 'Информация о местоположении недоступна';
                    break;
                case error.TIMEOUT:
                    message = 'Время ожидания истекло';
                    break;
            }
            locationInfo.innerHTML = `<p class="error">${message}</p>`;
        }
    );
}

function displayLocationInfo(location) {
    locationInfo.innerHTML = `
        <p><strong>Широта:</strong> ${location.latitude.toFixed(6)}</p>
        <p><strong>Долгота:</strong> ${location.longitude.toFixed(6)}</p>
        <p><i class="fas fa-check-circle success"></i> Местоположение определено</p>
    `;
}

async function findNearbyMosques(location) {
    mosquesList.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Поиск ближайших мечетей...</p>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/find-mosques`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify(location)
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayMosques(data.nearbyMosques);
            
            if (data.instructions) {
                const instructionsDiv = document.createElement('div');
                instructionsDiv.className = 'instructions';
                instructionsDiv.innerHTML = `<p>${data.instructions}</p>`;
                mosquesList.appendChild(instructionsDiv);
            }
        } else {
            mosquesList.innerHTML = `<p class="error">Не удалось найти мечети: ${data.message}</p>`;
        }
    } catch (error) {
        mosquesList.innerHTML = '<p class="error">Ошибка при поиске мечетей</p>';
    }
}

function displayMosques(mosques) {
    if (!mosques || mosques.length === 0) {
        mosquesList.innerHTML = '<p>Мечети не найдены поблизости</p>';
        return;
    }
    
    mosquesList.innerHTML = '';
    
    mosques.forEach(mosque => {
        const mosqueDiv = document.createElement('div');
        mosqueDiv.className = 'mosque-item';
        mosqueDiv.innerHTML = `
            <div>
                <h4>${mosque.name}</h4>
                <p>${mosque.address || 'Адрес не указан'}</p>
            </div>
            <div class="mosque-distance">
                <span class="distance-badge">${mosque.distance || '?'}</span>
            </div>
        `;
        
        mosquesList.appendChild(mosqueDiv);
    });
}

function calculateQiblaDirection(location) {
    // Simple Qibla calculation (for demonstration)
    // In production, use accurate spherical trigonometry
    const meccaLat = 21.4225;
    const meccaLng = 39.8262;
    
    // Convert to radians
    const lat1 = location.latitude * Math.PI / 180;
    const lng1 = location.longitude * Math.PI / 180;
    const lat2 = meccaLat * Math.PI / 180;
    const lng2 = meccaLng * Math.PI / 180;
    
    // Calculate Qibla direction
    const y = Math.sin(lng2 - lng1);
    const x = Math.cos(lat1) * Math.tan(lat2) - Math.sin(lat1) * Math.cos(lng2 - lng1);
    let qibla = Math.atan2(y, x) * 180 / Math.PI;
    
    // Convert to compass bearing
    qibla = (qibla + 360) % 360;
    
    displayQiblaDirection(qibla);
}

function displayQiblaDirection(degrees) {
    // Update compass arrow
    compassArrow.style.transform = `translate(-50%, -50%) rotate(${degrees}deg)`;
    compassDegree.textContent = `${Math.round(degrees)}°`;
    
    // Update direction info
    const direction = getDirectionFromDegrees(degrees);
    qiblaInfo.innerHTML = `
        <p><strong>Направление Киблы:</strong> ${Math.round(degrees)}° (${direction})</p>
        <p><strong>Относительно севера:</strong> Поверните на ${Math.round(degrees)}° по часовой стрелке от севера</p>
        <p><i class="fas fa-lightbulb"></i> Используйте компас на телефоне или приложение для точного определения</p>
    `;
}

function getDirectionFromDegrees(degrees) {
    const directions = ['Север', 'Северо-восток', 'Восток', 'Юго-восток', 'Юг', 'Юго-запад', 'Запад', 'Северо-запад'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}

// History Functions
function addToHistory(item) {
    scanHistory.unshift(item);
    if (scanHistory.length > 50) {
        scanHistory = scanHistory.slice(0, 50);
    }
    localStorage.setItem('scanHistory', JSON.stringify(scanHistory));
    
    // Update history tab if active
    if (document.getElementById('historyTab').classList.contains('active')) {
        loadHistory();
    }
}

function loadHistory() {
    if (scanHistory.length === 0) {
        historyList.innerHTML = `
            <div class="empty-history">
                <i class="fas fa-history"></i>
                <p>История сканирований пуста</p>
            </div>
        `;
        return;
    }
    
    historyList.innerHTML = '';
    
    scanHistory.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        let content = '';
        const date = new Date(item.timestamp).toLocaleString();
        
        switch(item.type) {
            case 'barcode':
                content = `
                    <div class="history-icon">
                        <i class="fas fa-barcode"></i>
                    </div>
                    <div class="history-content">
                        <h4>Штрих-код: ${item.barcode}</h4>
                        <p>${item.product?.name || 'Неизвестный продукт'}</p>
                        <p class="history-status ${item.product?.halalStatus}">${item.product?.halalStatus?.toUpperCase() || 'НЕИЗВЕСТНО'}</p>
                        <p class="history-date">${date}</p>
                    </div>
                `;
                break;
            case 'image':
                content = `
                    <div class="history-icon">
                        <i class="fas fa-camera"></i>
                    </div>
                    <div class="history-content">
                        <h4>Анализ изображения</h4>
                        <p>Статус: ${item.analysis?.halalStatus?.toUpperCase() || 'НЕИЗВЕСТНО'}</p>
                        <p class="history-status ${item.analysis?.halalStatus}">${item.analysis?.halalStatus?.toUpperCase() || 'НЕИЗВЕСТНО'}</p>
                        <p class="history-date">${date}</p>
                    </div>
                `;
                break;
            case 'text':
                content = `
                    <div class="history-icon">
                        <i class="fas fa-keyboard"></i>
                    </div>
                    <div class="history-content">
                        <h4>Анализ текста</h4>
                        <p>${item.text.substring(0, 50)}${item.text.length > 50 ? '...' : ''}</p>
                        <p class="history-status ${item.analysis?.halalStatus}">${item.analysis?.halalStatus?.toUpperCase() || 'НЕИЗВЕСТНО'}</p>
                        <p class="history-date">${date}</p>
                    </div>
                `;
                break;
        }
        
        historyItem.innerHTML = content;
        historyList.appendChild(historyItem);
    });
}

function clearHistory() {
    if (confirm('Очистить всю историю сканирований?')) {
        scanHistory = [];
        localStorage.removeItem('scanHistory');
        loadHistory();
        showMessage('История очищена', 'success');
    }
}

// Utility Functions
function showMessage(message, type = 'info') {
    // Remove existing messages
    const existingMessages = document.querySelectorAll('.message-popup');
    existingMessages.forEach(msg => msg.remove());
    
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-popup ${type}`;
    messageDiv.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add to body
    document.body.appendChild(messageDiv);
    
    // Position and animate
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '20px';
    messageDiv.style.right = '20px';
    messageDiv.style.padding = '15px 20px';
    messageDiv.style.borderRadius = '8px';
    messageDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    messageDiv.style.zIndex = '1000';
    messageDiv.style.display = 'flex';
    messageDiv.style.alignItems = 'center';
    messageDiv.style.gap = '10px';
    messageDiv.style.fontWeight = '500';
    
    if (type === 'error') {
        messageDiv.style.background = 'linear-gradient(135deg, #ff6b6b, #ee5a52)';
        messageDiv.style.color = 'white';
    } else if (type === 'success') {
        messageDiv.style.background = 'linear-gradient(135deg, #2ec27e, #26a269)';
        messageDiv.style.color = 'white';
    } else {
        messageDiv.style.background = 'white';
        messageDiv.style.color = '#333';
        messageDiv.style.border = '2px solid #1a5fb4';
    }
    
    // Remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateY(-20px)';
            messageDiv.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }
    }, 5000);
}

function showLoading(message) {
    updateStatusIndicator('unknown');
    statusIndicator.querySelector('.status-text').textContent = message;
    
    resultCard.style.opacity = '0.7';
    
    // Clear previous results
    productInfo.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> ' + message + '</p>';
    halalStatus.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Анализ...</p></div>';
    ingredientsList.innerHTML = '<h4>Состав:</h4><p>Анализ...</p>';
    explanation.innerHTML = '<h4>Объяснение:</h4><p>Подготовка результатов...</p>';
}

// Export for global access
window.startBarcodeScanner = startBarcodeScanner;
window.stopBarcodeScanner = stopBarcodeScanner;
window.scanBarcode = scanBarcode;
window.captureImage = captureImage;
window.checkIngredients = checkIngredients;
window.askImam = askImam;
window.getLocation = getLocation;
window.switchTab = switchTab;
window.switchAuthTab = switchAuthTab;
window.login = login;
window.register = register;
window.clearHistory = clearHistory;