/* HALAL GUIDE ENTERPRISE LOGIC */

let token = localStorage.getItem('token');
let html5QrcodeScanner = null;
let map = null;

// ПРИ ЗАГРУЗКЕ
window.onload = async () => {
    if (token) {
        // Проверяем токен, загружая профиль
        const res = await fetch('/api/me', { headers: { 'Authorization': token } });
        if (res.ok) {
            const user = await res.json();
            setupApp(user);
        } else {
            // Токен протух
            logout();
        }
    } else {
        document.getElementById('auth-screen').style.display = 'flex';
    }
};

// --- АВТОРИЗАЦИЯ ---
function toggleAuth(mode) {
    if (mode === 'register') {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
    } else {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
    }
}

async function login() {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    if(!u || !p) return alert("Заполните поля");

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: u, password: p })
        });
        const data = await res.json();
        
        if (data.token) {
            localStorage.setItem('token', data.token);
            token = data.token;
            setupApp({ username: data.username, isPremium: data.isPremium });
        } else {
            alert(data.error);
        }
    } catch (e) { alert("Ошибка сервера"); }
}

async function register() {
    const u = document.getElementById('reg-username').value;
    const p = document.getElementById('reg-password').value;
    if(!u || !p) return alert("Заполните поля");

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username: u, password: p })
        });
        if (res.ok) {
            alert("Аккаунт создан! Войдите.");
            toggleAuth('login');
        } else {
            const data = await res.json();
            alert(data.error);
        }
    } catch(e) { alert("Ошибка регистрации"); }
}

function logout() {
    localStorage.removeItem('token');
    location.reload();
}

function setupApp(user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('user-name-display').innerText = user.username;
    
    const badge = document.getElementById('status-badge');
    if (user.isPremium) {
        badge.innerText = "PREMIUM";
        badge.classList.remove('free');
        badge.classList.add('premium');
    } else {
        badge.innerText = "FREE";
        badge.classList.add('free');
        badge.classList.remove('premium');
    }

    loadDaily();
}

// --- НАВИГАЦИЯ ---
function switchTab(tab, el) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
    if(el && !el.classList.contains('nav-btn-center')) el.classList.add('active');

    if(tab === 'scan') startScanner(); else stopScanner();
    if(tab === 'map') initMap();
}

// --- ФУНКЦИИ ---
async function loadDaily() {
    try {
        const res = await fetch('/api/daily');
        const data = await res.json();
        document.getElementById('daily-arabic').innerText = data.arabic;
        document.getElementById('daily-translation').innerText = data.translation;
        document.getElementById('daily-source').innerText = data.source;
    } catch(e){}
}

// СКАНЕР
function startScanner() {
    if(html5QrcodeScanner) return;
    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess)
        .catch(() => console.log("Камера занята или нет прав"));
}
function stopScanner() {
    if(html5QrcodeScanner) html5QrcodeScanner.stop().then(() => { html5QrcodeScanner.clear(); html5QrcodeScanner = null; });
}

async function onScanSuccess(code) {
    stopScanner();
    showModal('loading');
    document.getElementById('barcode-input').value = code;

    const res = await fetch('/api/barcode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': token},
        body: JSON.stringify({ code: code })
    });

    if (res.status === 403) { // ЛИМИТ
        closeModal('result-modal');
        showPaywall();
        return;
    }
    
    const data = await res.json();
    if(!data.found) return showModal('not_found');
    if(!data.hasIngredients) return showModal('photo_needed');
    showResult(data);
}

async function manualSearch() {
    const code = document.getElementById('barcode-input').value;
    if(code) onScanSuccess(code);
}

// ФОТО
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        showModal('loading');
        const res = await fetch('/api/photo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': token},
            body: JSON.stringify({ image: ev.target.result })
        });

        if (res.status === 403) {
            closeModal('result-modal');
            showPaywall();
            return;
        }

        const data = await res.json();
        data.name = "Фото состава";
        showResult(data);
    };
    reader.readAsDataURL(file);
});

// ЧАТ
async function sendMessage() {
    const inp = document.getElementById('chat-input');
    const txt = inp.value.trim();
    if(!txt) return;

    addMsg(txt, 'user');
    inp.value = '';
    const loadId = addMsg('...', 'ai', true);

    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': token},
        body: JSON.stringify({ message: txt })
    });
    const data = await res.json();
    document.getElementById(loadId).remove();
    addMsg(data.text, 'ai');
}
function addMsg(text, type, isTemp) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    if(isTemp) div.id = 'temp';
    div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    const hist = document.getElementById('chat-history');
    hist.appendChild(div);
    hist.scrollTop = hist.scrollHeight;
    return isTemp ? 'temp' : null;
}

// КАРТА
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
    });
}

// UI HELPERS
function showModal(type) {
    const m = document.getElementById('result-modal');
    m.style.display = 'flex';
    const t = document.getElementById('res-title');
    const r = document.getElementById('res-reason');
    const b = document.getElementById('res-badge');
    
    b.style.display = 'none';
    if(type === 'loading') { t.innerText = "Анализ..."; r.innerText = "Подождите..."; }
    if(type === 'not_found') { t.innerText = "Нет в базе"; r.innerText = "Сфотографируйте состав!"; setTimeout(() => closeModal('result-modal'), 2000); }
    if(type === 'photo_needed') { t.innerText = "Нужно фото"; r.innerText = "Состав не найден. Сфоткайте."; }
}
function showResult(data) {
    const m = document.getElementById('result-modal'); m.style.display = 'flex';
    const b = document.getElementById('res-badge'); b.style.display = 'inline-block';
    
    b.className = `badge ${data.status === 'HALAL' ? 'halal' : data.status === 'HARAM' ? 'haram' : 'mushbooh'}`;
    b.innerText = data.status === 'HALAL' ? '✅ ХАЛЯЛЬ' : data.status === 'HARAM' ? '⛔ ХАРАМ' : '⚠️ СОМНИТЕЛЬНО';
    
    document.getElementById('res-title').innerText = data.name;
    document.getElementById('res-reason').innerText = data.reason;
    
    const list = document.getElementById('res-list'); list.innerHTML = '';
    if(data.ingredients_detected) data.ingredients_detected.forEach(i => {
        const li = document.createElement('li'); li.innerText = i; li.style.color = 'red'; list.appendChild(li);
    });
}

function showPaywall() { document.getElementById('paywall-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; if(id==='result-modal' && document.getElementById('tab-scan').classList.contains('active')) startScanner(); }

// ОПЛАТА
async function buyPremium() {
    const res = await fetch('/api/buy-premium', {
        method: 'POST', headers: { 'Authorization': token }
    });
    const data = await res.json();
    if(data.success) {
        alert("Оплата успешна! Вы теперь Premium.");
        location.reload(); // Перезагружаем, чтобы обновить статус
    }
}