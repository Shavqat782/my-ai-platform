// Вставь сюда ссылку, которую дал Render (без слэша в конце)
const API_URL = "https://abdulla-ai-pro.onrender.com";
let token = localStorage.getItem('token');
let scanner = null;
let map = null;
let userPos = null;

window.onload = () => {
    if(token) checkAuth();
    else document.getElementById('auth-screen').style.display = 'flex';
};

// --- AUTH ---
async function checkAuth() {
    const res = await fetch(https://abdulla-ai-pro.onrender.com + '/api/me', { headers: { 'Authorization': token }});
    if(res.ok) {
        const d = await res.json();
        setupUser(d.user);
    } else { document.getElementById('auth-screen').style.display = 'flex'; }
}

function setupUser(u) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('u-name').innerText = u.username;
    if(u.isPremium) {
        const b = document.getElementById('u-badge');
        b.innerText = "VIP"; b.classList.remove('free'); b.classList.add('premium');
    }
    loadDaily();
}

function toggleAuth() {
    const l = document.getElementById('login-form');
    const r = document.getElementById('reg-form');
    if(l.style.display === 'none') { l.style.display = 'block'; r.style.display = 'none'; }
    else { l.style.display = 'none'; r.style.display = 'block'; }
}

async function login() {
    const u = document.getElementById('l-user').value;
    const p = document.getElementById('l-pass').value;
    const res = await fetch(https://abdulla-ai-pro.onrender.com + '/api/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:u, password:p})
    });
    const d = await res.json();
    if(d.token) { localStorage.setItem('token', d.token); token = d.token; checkAuth(); }
    else alert(d.error);
}

async function register() {
    const u = document.getElementById('r-user').value;
    const p = document.getElementById('r-pass').value;
    const res = await fetch(https://abdulla-ai-pro.onrender.com + '/api/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:u, password:p})
    });
    if(res.ok) { alert("Готово! Войдите"); toggleAuth(); }
    else alert("Ошибка");
}

// --- TABS ---
function switchTab(t, el) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    document.querySelectorAll('.nav-i').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');

    if(t === 'scan') startScan(); else stopScan();
    if(t === 'map') setTimeout(initMap, 200); // Fix map render issue
}

// --- SCANNER ---
function startScan() {
    if(scanner) return;
    scanner = new Html5Qrcode("reader");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScan);
}
function stopScan() { if(scanner) scanner.stop().then(() => { scanner.clear(); scanner = null; }); }

async function onScan(code) {
    stopScan();
    showResult({ name: "Анализ...", status: "MUSHBOOH", reason: "Загрузка..." });
    
    const res = await fetch(https://abdulla-ai-pro.onrender.com + '/api/barcode', {
        method:'POST', headers:{'Content-Type':'application/json', 'Authorization':token},
        body:JSON.stringify({code})
    });
    
    if(res.status === 403) return openPaywall();
    const d = await res.json();

    if(!d.found) {
        if(confirm("Товара нет в базе. Сфотографировать состав?")) document.getElementById('file').click();
        else startScan();
        return;
    }
    if(!d.hasIngredients) {
        if(confirm("Состав не найден. Сфотографировать?")) document.getElementById('file').click();
        return;
    }
    showResult(d);
}

document.getElementById('file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = async (ev) => {
        showResult({ name: "Фото...", status: "MUSHBOOH", reason: "Анализ ИИ..." });
        const res = await fetch(https://abdulla-ai-pro.onrender.com + '/api/photo', {
            method:'POST', headers:{'Content-Type':'application/json', 'Authorization':token},
            body:JSON.stringify({image:ev.target.result})
        });
        if(res.status === 403) return openPaywall();
        const d = await res.json();
        d.name = "Фото состава"; d.found = true;
        showResult(d);
    };
    r.readAsDataURL(f);
});

function showResult(d) {
    document.getElementById('res-modal').style.display = 'flex';
    document.getElementById('r-title').innerText = d.name;
    document.getElementById('r-reason').innerText = d.reason;
    const b = document.getElementById('r-badge');
    b.className = 'res-badge ' + (d.status==='HALAL'?'halal':d.status==='HARAM'?'haram':'mushbooh');
    b.innerText = d.status;
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    if(id==='res-modal' && document.getElementById('tab-scan').classList.contains('active')) startScan();
}

// --- MAP & QIBLA ---
function initMap() {
    if(map) { map.invalidateSize(); return; }
    map = L.map('map').setView([38.55, 68.78], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    locateUser();
}

function locateUser() {
    navigator.geolocation.getCurrentPosition(pos => {
        const {latitude, longitude} = pos.coords;
        userPos = {lat: latitude, lng: longitude};
        
        map.setView([latitude, longitude], 15);
        L.marker([latitude, longitude]).addTo(map).bindPopup("Я").openPopup();
        
        // QIBLA
        const qibla = calculateQibla(latitude, longitude);
        document.getElementById('q-icon').style.transform = `rotate(${qibla}deg)`;
        document.getElementById('q-text').innerText = `Кибла: ${Math.round(qibla)}°`;
        
        // MOSQUES (Overpass API)
        findMosques(latitude, longitude);
    });
}

function calculateQibla(lat, lng) {
    const kLat = 21.4225, kLng = 39.8262;
    const y = Math.sin((kLng-lng) * Math.PI/180);
    const x = Math.cos(lat*Math.PI/180)*Math.tan(kLat*Math.PI/180) - Math.sin(lat*Math.PI/180)*Math.cos((kLng-lng)*Math.PI/180);
    return (Math.atan2(y, x) * 180/Math.PI + 360) % 360;
}

async function findMosques(lat, lng) {
    const q = `[out:json];node["amenity"="place_of_worship"]["religion"="muslim"](around:2000,${lat},${lng});out;`;
    const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
    const d = await res.json();
    d.elements.forEach(m => {
        L.marker([m.lat, m.lon], {icon: L.divIcon({html:'<i class="fas fa-mosque" style="color:green;font-size:24px"></i>', className:''})})
        .addTo(map)
        .bindPopup(`<b>${m.tags.name || "Мечеть"}</b><br><a href="https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lon}" target="_blank">Маршрут</a>`);
    });
}

// --- CHAT ---
async function sendMsg() {
    const inp = document.getElementById('msg-in');
    const txt = inp.value; if(!txt) return;
    
    addMsg(txt, 'user');
    inp.value = '';
    
    const res = await fetch(https://abdulla-ai-pro.onrender.com + '/api/chat', {
        method:'POST', headers:{'Content-Type':'application/json', 'Authorization':token},
        body:JSON.stringify({message:txt})
    });
    const d = await res.json();
    addMsg(d.text, 'ai');
}
function addMsg(txt, type) {
    const d = document.createElement('div');
    d.className = `msg ${type}`;
    d.innerHTML = txt.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    document.getElementById('chat-box').appendChild(d);
}

// --- PAYWALL & EXTRAS ---
function openPaywall() { document.getElementById('pay-modal').style.display = 'flex'; }
async function buyPremium() {
    await fetch(https://abdulla-ai-pro.onrender.com + '/api/buy', {method:'POST', headers:{'Authorization':token}});
    alert("Куплено!"); location.reload();
}
async function loadDaily() {
    const r = await fetch(https://abdulla-ai-pro.onrender.com + '/api/daily'); const d = await r.json();
    document.getElementById('d-arabic').innerText = d.arabic;
    document.getElementById('d-trans').innerText = d.translation;
    document.getElementById('d-source').innerText = d.source;
}