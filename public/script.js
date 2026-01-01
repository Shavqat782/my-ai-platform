let token = localStorage.getItem('token');
let html5QrcodeScanner = null;
let map = null;

// ПРИ ЗАГРУЗКЕ
window.onload = () => {
    if (token) {
        showApp(); // Если есть ключ - пускаем
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
    }
};

// --- АВТОРИЗАЦИЯ ---
async function login() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    
    if (data.token) {
        localStorage.setItem('token', data.token);
        token = data.token;
        updatePremiumUI(data.isPremium);
        showApp();
    } else { alert(data.error); }
}

async function register() {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    const res = await fetch('/api/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: u, password: p })
    });
    if (res.ok) { alert("Создано! Теперь войдите."); login(); }
    else alert("Ошибка регистрации");
}

function showApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    loadDaily();
    document.getElementById('user-greeting').innerText = document.getElementById('username').value || "Мусульманин";
}

function updatePremiumUI(isPremium) {
    const badge = document.getElementById('premium-badge');
    if (isPremium) {
        badge.innerText = "PREMIUM";
        badge.classList.add('premium');
    } else {
        badge.innerText = "FREE";
        badge.classList.remove('premium');
    }
}

// --- ПОКУПКА ---
function showPaywall() {
    document.getElementById('paywall-modal').style.display = 'flex';
}
async function buyPremium() {
    const res = await fetch('/api/buy-premium', {
        method: 'POST', headers: { 'Authorization': token }
    });
    const data = await res.json();
    if(data.success) {
        alert("Оплата прошла!");
        updatePremiumUI(true);
        closeModal('paywall-modal');
    }
}

// --- СКАНЕР (С ПРОВЕРКОЙ ОШИБКИ ЛИМИТА) ---
async function onScanSuccess(decodedText) {
    stopScanner();
    // ... UI loading ...
    
    const res = await fetch('/api/barcode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': token}, // Шлем токен
        body: JSON.stringify({ code: decodedText })
    });
    
    if (res.status === 403) { // 403 = ЛИМИТ
        showPaywall();
        return;
    }
    
    const data = await res.json();
    // ... обработка результата (как в прошлом коде) ...
    // ... если не найдено - showModal('not_found') ...
    handleResultData(data);
}

// То же самое для фото
async function sendPhoto(base64) {
    const res = await fetch('/api/photo', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': token},
        body: JSON.stringify({ image: base64 })
    });
    if (res.status === 403) { showPaywall(); return; }
    const data = await res.json();
    data.found = true; data.name = "Фото состава";
    handleResultData(data);
}

// ... ОСТАЛЬНЫЕ ФУНКЦИИ (switchTab, loadDaily, sendMessage) ОСТАЮТСЯ КАК В ПРОШЛОМ КОДЕ ...
// Просто везде добавь headers: { 'Authorization': token } в fetch запросы!

// --- КАРТА ---
function initMap() {
    if(map) return;
    map = L.map('map').setView([38.55, 68.78], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}
function locateMe() {
    navigator.geolocation.getCurrentPosition(pos => {
        const {latitude, longitude} = pos.coords;
        map.setView([latitude, longitude], 15);
        L.marker([latitude, longitude]).addTo(map).bindPopup("Я").openPopup();
        // Тут можно добавить поиск мечетей через Overpass API
    });
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// Вспомогательная для сканера (вставь в onScanSuccess)
function handleResultData(data) {
    const modal = document.getElementById('result-modal');
    modal.style.display = 'flex';
    document.getElementById('res-title').innerText = data.name || "Товар";
    document.getElementById('res-reason').innerText = data.reason || "Нет данных";
    // ... настройка цветов бейджа ...
}