let html5QrcodeScanner = null;
let map = null;
let userMarker = null;

// ЗАГРУЗКА
window.onload = () => {
    setTimeout(() => document.getElementById('preloader').style.display = 'none', 1000);
    loadDaily();
};

function switchTab(tab, el) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    // Подсветка кнопок
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if(el && !el.classList.contains('nav-btn-center')) el.classList.add('active');

    // Логика вкладок
    if (tab === 'scan') startScanner(); else stopScanner();
    if (tab === 'map') initMap(); // Загружаем карту только когда открыли вкладку
}

// --- ХАДИС ---
async function loadDaily() {
    try {
        const res = await fetch('/api/daily');
        const data = await res.json();
        document.getElementById('daily-arabic').innerText = data.arabic || "";
        document.getElementById('daily-translation').innerText = data.translation;
        document.getElementById('daily-source').innerText = data.source;
    } catch(e){}
}

// --- КАРТА И КИБЛА (НОВОЕ!) ---
function initMap() {
    if (map) return; // Если уже создана, не трогаем

    // Создаем карту (по умолчанию Душанбе)
    map = L.map('map').setView([38.5598, 68.7870], 13);

    // Добавляем слой (вид карты) - бесплатный OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data © OpenStreetMap contributors'
    }).addTo(map);

    locateMe(); // Сразу ищем юзера
}

function locateMe() {
    if (!navigator.geolocation) return alert("Ваш браузер не поддерживает GPS");

    document.getElementById('qibla-text').innerText = "Ищем спутники...";
    
    navigator.geolocation.getCurrentPosition(position => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        // Двигаем карту
        map.setView([lat, lng], 15);
        
        // Ставим метку "Я"
        if (userMarker) map.removeLayer(userMarker);
        userMarker = L.marker([lat, lng]).addTo(map).bindPopup("Вы здесь").openPopup();

        // 1. СЧИТАЕМ КИБЛУ (Математика)
        const qiblaAngle = calculateQibla(lat, lng);
        const arrow = document.getElementById('qibla-arrow');
        arrow.style.transform = `rotate(${qiblaAngle}deg)`; // Крутим стрелку
        document.getElementById('qibla-text').innerText = `Кибла: ${Math.round(qiblaAngle)}° (Стрелка указывает)`;

        // 2. ИЩЕМ МЕЧЕТИ РЯДОМ (Через Overpass API - бесплатная база карт)
        findMosques(lat, lng);

    }, () => {
        alert("Не удалось определить местоположение. Включите GPS.");
    });
}

function calculateQibla(lat, lng) {
    const kaabaLat = 21.4225;
    const kaabaLng = 39.8262;
    const y = Math.sin((kaabaLng - lng) * (Math.PI / 180));
    const x = Math.cos(lat * (Math.PI / 180)) * Math.tan(kaabaLat * (Math.PI / 180)) - Math.sin(lat * (Math.PI / 180)) * Math.cos((kaabaLng - lng) * (Math.PI / 180));
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    return (angle + 360) % 360; // Угол в градусах
}

async function findMosques(lat, lng) {
    // Ищем мечети в радиусе 3км через OpenStreetMap API
    const query = `
        [out:json];
        (node["amenity"="place_of_worship"]["religion"="muslim"](around:3000,${lat},${lng});
         way["amenity"="place_of_worship"]["religion"="muslim"](around:3000,${lat},${lng}););
        out;
    `;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        
        data.elements.forEach(place => {
            const pLat = place.lat || place.center.lat;
            const pLng = place.lon || place.center.lon;
            // Добавляем зеленый маркер мечети
            const icon = L.divIcon({html: '<i class="fas fa-mosque" style="color:green; font-size:24px;"></i>', className: 'mosque-icon'});
            L.marker([pLat, pLng], {icon: icon}).addTo(map)
             .bindPopup(place.tags.name || "Мечеть");
        });
    } catch(e) { console.log("Ошибка поиска мечетей"); }
}

// --- ЧАТ (ИСПРАВЛЕНО!) ---
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;

    addMsg(text, 'user');
    input.value = '';
    
    const loadingId = addMsg('Муфтий пишет...', 'ai', true);

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        
        document.getElementById(loadingId).remove();
        addMsg(data.text, 'ai');
    } catch (e) {
        document.getElementById(loadingId).innerText = "Ошибка сервера. Попробуйте позже.";
    }
}

function addMsg(text, sender, isTemp = false) {
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    if(isTemp) div.id = 'temp-msg';
    div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    document.getElementById('chat-history').appendChild(div);
    return div.id;
}

// --- СКАНЕР (Остался прежним) ---
function startScanner() {
    if(html5QrcodeScanner) return;
    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess);
}
function stopScanner() {
    if(html5QrcodeScanner) html5QrcodeScanner.stop().then(() => { html5QrcodeScanner.clear(); html5QrcodeScanner = null; });
}
async function onScanSuccess(decodedText) {
    stopScanner();
    showModal('loading');
    document.getElementById('barcode-input').value = decodedText;
    
    try {
        const res = await fetch('/api/barcode', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code: decodedText })
        });
        const data = await res.json();
        showResult(data);
    } catch(e) { showModal('error'); }
}
async function manualSearch() {
    const code = document.getElementById('barcode-input').value;
    onScanSuccess(code);
}
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        showModal('loading');
        try {
            const res = await fetch('/api/photo', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ image: ev.target.result })
            });
            const data = await res.json();
            data.found = true; data.name = "Фото"; 
            showResult(data);
        } catch(e) { showModal('error'); }
    }
    reader.readAsDataURL(file);
});

// МОДАЛКА
function showModal(type) {
    document.getElementById('result-modal').style.display = 'flex';
    const badge = document.getElementById('res-badge');
    const title = document.getElementById('res-title');
    const text = document.getElementById('res-reason');
    
    if(type === 'loading') {
        title.innerText = "Анализ...";
        text.innerText = "Смотрим базу и состав...";
        badge.style.display = 'none';
    } else if (type === 'error') {
        title.innerText = "Ошибка";
        text.innerText = "Не удалось проверить.";
    }
}
function showResult(data) {
    document.getElementById('result-modal').style.display = 'flex';
    const badge = document.getElementById('res-badge');
    badge.style.display = 'inline-block';
    
    if(!data.found) {
        badge.className = 'badge mushbooh'; badge.innerText = 'НЕ НАЙДЕНО';
        document.getElementById('res-title').innerText = "Нет в базе";
        document.getElementById('res-reason').innerText = "Сфотографируйте состав";
        return;
    }

    if(data.status === 'HALAL') {
        badge.className = 'badge halal'; badge.innerText = '✅ ХАЛЯЛЬ';
    } else if (data.status === 'HARAM') {
        badge.className = 'badge haram'; badge.innerText = '⛔ ХАРАМ';
    } else {
        badge.className = 'badge mushbooh'; badge.innerText = '⚠️ СОМНИТЕЛЬНО';
    }
    document.getElementById('res-title').innerText = data.name;
    document.getElementById('res-reason').innerText = data.reason;
    
    // Список ингредиентов
    const list = document.getElementById('res-list');
    list.innerHTML = '';
    if(data.ingredients_detected) {
        data.ingredients_detected.forEach(i => {
            const li = document.createElement('li'); li.innerText = i; li.style.color = 'red';
            list.appendChild(li);
        });
    }
}
function closeModal() {
    document.getElementById('result-modal').style.display = 'none';
    if(document.getElementById('tab-scan').classList.contains('active')) startScanner();
}