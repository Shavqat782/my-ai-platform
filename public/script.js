// Global variables
let currentUser = null;
let scanHistory = JSON.parse(localStorage.getItem('scanHistory')) || [];

// API Base URL
const API_BASE_URL = window.location.origin;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupEventListeners();
    
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        currentUser = { username: 'User' };
        showScannerSection();
    }
});

// Event Listeners
function setupEventListeners() {
    // Barcode scanner input
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                scanBarcode();
            }
        });
    }
    
    // Image upload
    const imageUpload = document.getElementById('imageUpload');
    const uploadArea = document.getElementById('uploadArea');
    
    if (uploadArea && imageUpload) {
        uploadArea.addEventListener('click', () => {
            imageUpload.click();
        });
        
        imageUpload.addEventListener('change', handleImageUpload);
    }
    
    // Auto-detect location on mosque tab
    const mosqueTab = document.querySelector('.tab[onclick*="mosque"]');
    if (mosqueTab) {
        mosqueTab.addEventListener('click', () => {
            if (!currentLocation) {
                getLocation();
            }
        });
    }
}

// Authentication Functions
async function register() {
    const username = document.getElementById('registerUsername')?.value;
    const password = document.getElementById('registerPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    
    if (!username || !password) {
        showMessage('Введите имя пользователя и пароль', 'error');
        return;
    }
    
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
            localStorage.setItem('token', data.token);
            currentUser = { username };
            showScannerSection();
            showMessage('Регистрация успешна!', 'success');
        } else {
            showMessage(data.message, 'error');
        }
    } catch (error) {
        showMessage('Ошибка соединения с сервером', 'error');
    }
}

async function login() {
    const username = document.getElementById('loginUsername')?.value;
    const password = document.getElementById('loginPassword')?.value;
    
    if (!username || !password) {
        showMessage('Введите имя пользователя и пароль', 'error');
        return;
    }
    
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

// UI Navigation Functions
function checkAuthStatus() {
    const authSection = document.getElementById('authSection');
    const scannerSection = document.getElementById('scannerSection');
    
    if (!authSection || !scannerSection) return;
    
    if (currentUser) {
        authSection.style.display = 'none';
        scannerSection.style.display = 'block';
    } else {
        authSection.style.display = 'block';
        scannerSection.style.display = 'none';
    }
}

function showScannerSection() {
    const authSection = document.getElementById('authSection');
    const scannerSection = document.getElementById('scannerSection');
    
    if (authSection) authSection.style.display = 'none';
    if (scannerSection) scannerSection.style.display = 'block';
    
    switchTab('scanner');
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.style.display = 'none');
    
    if (tab === 'login') {
        const loginTab = document.querySelector('.auth-tab[onclick*="login"]');
        const loginForm = document.getElementById('loginForm');
        if (loginTab) loginTab.classList.add('active');
        if (loginForm) loginForm.style.display = 'flex';
    } else {
        const registerTab = document.querySelector('.auth-tab[onclick*="register"]');
        const registerForm = document.getElementById('registerForm');
        if (registerTab) registerTab.classList.add('active');
        if (registerForm) registerForm.style.display = 'flex';
    }
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Activate selected tab
    const selectedTab = document.querySelector(`.tab[onclick*="${tabName}"]`);
    const selectedContent = document.getElementById(`${tabName}Tab`);
    
    if (selectedTab) selectedTab.classList.add('active');
    if (selectedContent) selectedContent.classList.add('active');
    
    // Load content for specific tabs
    if (tabName === 'history') {
        loadHistory();
    } else if (tabName === 'mosque') {
        getLocation();
    }
}

// Barcode Scanner Functions
async function scanBarcode() {
    const barcodeInput = document.getElementById('barcodeInput');
    const barcode = barcodeInput?.value.trim();
    
    if (!barcode) {
        showMessage('Введите штрих-код', 'error');
        return;
    }
    
    showLoading('Анализ штрих-кода...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/check-barcode`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ barcode })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayScanResult(data.product);
            
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

// Image Processing Functions
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        processImage(file);
    }
}

async function processImage(file) {
    showLoading('Чтение изображения...');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        // For simplicity, we'll extract text from image using OCR prompt
        // In real implementation, you would send image to server
        const ingredientsText = prompt("Введите состав продукта с изображения:");
        
        if (ingredientsText) {
            checkIngredients(ingredientsText);
            
            // Add to history
            addToHistory({
                type: 'image',
                filename: file.name,
                timestamp: new Date().toISOString()
            });
        }
    };
    
    reader.readAsDataURL(file);
}

// Ingredients Check
async function checkIngredients(text = null) {
    let ingredientsText = text;
    
    if (!ingredientsText) {
        const ingredientsInput = document.getElementById('ingredientsInput');
        ingredientsText = ingredientsInput?.value.trim();
    }
    
    if (!ingredientsText) {
        showMessage('Введите состав продукта', 'error');
        return;
    }
    
    showLoading('Анализ состава...');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/check-ingredients`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ingredientsText })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayIngredientsAnalysisResult(data.analysis, ingredientsText);
            
            // Add to history
            addToHistory({
                type: 'text',
                text: ingredientsText,
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
function displayScanResult(product) {
    updateStatusIndicator(product.halalStatus);
    
    const productInfo = document.getElementById('productInfo');
    const halalStatus = document.getElementById('halalStatus');
    const ingredientsList = document.getElementById('ingredientsList');
    const explanation = document.getElementById('explanation');
    
    if (productInfo) {
        productInfo.innerHTML = `
            <h4>${product.name || 'Неизвестный продукт'}</h4>
            <p><strong>Штрих-код:</strong> ${product.barcode}</p>
            <p><strong>Источник:</strong> AI анализ</p>
        `;
    }
    
    updateHalalStatus(product.halalStatus);
    
    if (ingredientsList) {
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
    }
    
    if (explanation) {
        explanation.innerHTML = `
            <h4>Объяснение:</h4>
            <p>${product.description || 'Нет дополнительной информации'}</p>
            ${product.verification ? `<p><em>${product.verification}</em></p>` : ''}
        `;
    }
    
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function displayIngredientsAnalysisResult(analysis, originalText) {
    updateStatusIndicator(analysis.halalStatus);
    
    const productInfo = document.getElementById('productInfo');
    const ingredientsList = document.getElementById('ingredientsList');
    const explanation = document.getElementById('explanation');
    
    if (productInfo) {
        productInfo.innerHTML = `
            <h4>Анализ текстового состава</h4>
            <p><strong>Тип анализа:</strong> Текстовый анализ</p>
        `;
    }
    
    updateHalalStatus(analysis.halalStatus);
    
    if (ingredientsList) {
        ingredientsList.innerHTML = `
            <h4>Проанализированные ингредиенты:</h4>
            <p>${originalText.substring(0, 200)}${originalText.length > 200 ? '...' : ''}</p>
        `;
    }
    
    if (explanation) {
        explanation.innerHTML = `
            <h4>Анализ:</h4>
            <p>${analysis.description || 'Нет дополнительной информации'}</p>
            ${analysis.riskyIngredients && analysis.riskyIngredients.length > 0 ? `
                <h4>Потенциально харам ингредиенты:</h4>
                <ul>${analysis.riskyIngredients.map(ing => `<li class="danger">${ing}</li>`).join('')}</ul>
            ` : ''}
        `;
    }
}

function updateStatusIndicator(status) {
    const statusIndicator = document.getElementById('statusIndicator');
    if (!statusIndicator) return;
    
    const statusDot = statusIndicator.querySelector('.status-dot');
    const statusText = statusIndicator.querySelector('.status-text');
    
    if (statusDot) statusDot.className = 'status-dot';
    if (statusText) statusText.textContent = status ? status.toUpperCase() : 'ОЖИДАНИЕ';
    
    if (statusDot) {
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
}

function updateHalalStatus(status) {
    const halalStatus = document.getElementById('halalStatus');
    if (!halalStatus) return;
    
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
    const questionInput = document.getElementById('questionInput');
    const question = questionInput?.value.trim();
    
    if (!question) {
        showMessage('Введите ваш вопрос', 'error');
        return;
    }
    
    // Add user message to chat
    addChatMessage(question, 'user');
    if (questionInput) questionInput.value = '';
    
    // Show loading
    const loadingId = addLoadingMessage();
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/ask-imam`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function addChatMessage(content, sender) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
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
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return null;
    
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
        const locationInfo = document.getElementById('locationInfo');
        if (locationInfo) {
            locationInfo.innerHTML = '<p class="error">Геолокация не поддерживается вашим браузером</p>';
        }
        return;
    }
    
    const locationInfo = document.getElementById('locationInfo');
    if (locationInfo) {
        locationInfo.innerHTML = '<p><i class="fas fa-sync-alt fa-spin"></i> Определение местоположения...</p>';
    }
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const currentLocation = {
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
            if (locationInfo) {
                locationInfo.innerHTML = `<p class="error">${message}</p>`;
            }
        }
    );
}

function displayLocationInfo(location) {
    const locationInfo = document.getElementById('locationInfo');
    if (locationInfo) {
        locationInfo.innerHTML = `
            <p><strong>Широта:</strong> ${location.latitude.toFixed(6)}</p>
            <p><strong>Долгота:</strong> ${location.longitude.toFixed(6)}</p>
            <p><i class="fas fa-check-circle success"></i> Местоположение определено</p>
        `;
    }
}

async function findNearbyMosques(location) {
    const mosquesList = document.getElementById('mosquesList');
    if (!mosquesList) return;
    
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
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(location)
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayMosques(data.nearbyMosques || []);
        } else {
            mosquesList.innerHTML = `<p>Используйте карты для поиска ближайших мечетей</p>`;
        }
    } catch (error) {
        mosquesList.innerHTML = '<p>Используйте Google Maps для поиска мечетей</p>';
    }
}

function displayMosques(mosques) {
    const mosquesList = document.getElementById('mosquesList');
    if (!mosquesList) return;
    
    if (!mosques || mosques.length === 0) {
        mosquesList.innerHTML = '<p>Используйте карты для поиска мечетей</p>';
        return;
    }
    
    mosquesList.innerHTML = '';
    
    mosques.forEach(mosque => {
        const mosqueDiv = document.createElement('div');
        mosqueDiv.className = 'mosque-item';
        mosqueDiv.innerHTML = `
            <div>
                <h4>${mosque.name || 'Мечеть'}</h4>
                <p>${mosque.address || 'Адрес не указан'}</p>
            </div>
            <div class="mosque-distance">
                <span class="distance-badge">${mosque.distance || 'рядом'}</span>
            </div>
        `;
        
        mosquesList.appendChild(mosqueDiv);
    });
}

function calculateQiblaDirection(location) {
    // Simple Qibla calculation
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
    const compassArrow = document.getElementById('compassArrow');
    const compassDegree = document.getElementById('compassDegree');
    const qiblaInfo = document.getElementById('qiblaInfo');
    
    if (compassArrow) {
        compassArrow.style.transform = `translate(-50%, -50%) rotate(${degrees}deg)`;
    }
    
    if (compassDegree) {
        compassDegree.textContent = `${Math.round(degrees)}°`;
    }
    
    if (qiblaInfo) {
        const direction = getDirectionFromDegrees(degrees);
        qiblaInfo.innerHTML = `
            <p><strong>Направление Киблы:</strong> ${Math.round(degrees)}° (${direction})</p>
            <p><strong>Относительно севера:</strong> Поверните на ${Math.round(degrees)}° по часовой стрелке от севера</p>
        `;
    }
}

function getDirectionFromDegrees(degrees) {
    const directions = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}

// History Functions
function addToHistory(item) {
    scanHistory.unshift(item);
    if (scanHistory.length > 20) {
        scanHistory = scanHistory.slice(0, 20);
    }
    localStorage.setItem('scanHistory', JSON.stringify(scanHistory));
    
    // Update history tab if active
    const historyTab = document.getElementById('historyTab');
    if (historyTab && historyTab.classList.contains('active')) {
        loadHistory();
    }
}

function loadHistory() {
    const historyList = document.getElementById('historyList');
    if (!historyList) return;
    
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
                        <p>${item.filename || 'Изображение'}</p>
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
    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-popup ${type}`;
    messageDiv.innerHTML = `
        <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'success' ? 'check-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    // Add to body
    document.body.appendChild(messageDiv);
    
    // Style
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 500;
        background: ${type === 'error' ? 'linear-gradient(135deg, #ff6b6b, #ee5a52)' : 
                    type === 'success' ? 'linear-gradient(135deg, #2ec27e, #26a269)' : 'white'};
        color: ${type === 'error' || type === 'success' ? 'white' : '#333'};
        border: ${type === 'info' ? '2px solid #1a5fb4' : 'none'};
    `;
    
    // Remove after 5 seconds
    setTimeout(() => {
        messageDiv.style.opacity = '0';
        messageDiv.style.transform = 'translateY(-20px)';
        messageDiv.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 300);
    }, 5000);
}

function showLoading(message) {
    updateStatusIndicator('unknown');
    
    const statusIndicator = document.getElementById('statusIndicator');
    if (statusIndicator) {
        const statusText = statusIndicator.querySelector('.status-text');
        if (statusText) statusText.textContent = message;
    }
    
    const resultCard = document.getElementById('resultCard');
    if (resultCard) resultCard.style.opacity = '0.7';
    
    // Clear previous results
    const productInfo = document.getElementById('productInfo');
    const halalStatus = document.getElementById('halalStatus');
    const ingredientsList = document.getElementById('ingredientsList');
    const explanation = document.getElementById('explanation');
    
    if (productInfo) productInfo.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> ' + message + '</p>';
    if (halalStatus) halalStatus.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Анализ...</p></div>';
    if (ingredientsList) ingredientsList.innerHTML = '<h4>Состав:</h4><p>Анализ...</p>';
    if (explanation) explanation.innerHTML = '<h4>Объяснение:</h4><p>Подготовка результатов...</p>';
}

// Make functions globally accessible
window.scanBarcode = scanBarcode;
window.checkIngredients = checkIngredients;
window.askImam = askImam;
window.getLocation = getLocation;
window.switchTab = switchTab;
window.switchAuthTab = switchAuthTab;
window.login = login;
window.register = register;
window.clearHistory = clearHistory;