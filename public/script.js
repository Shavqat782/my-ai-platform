/* HALAL GUIDE LOGIC */
let token = localStorage.getItem('token');
let scanner = null, map = null;

window.onload = () => {
    setTimeout(()=>document.getElementById('preloader').style.display='none', 1000);
    if(token) checkAuth();
    else document.getElementById('auth-screen').style.display = 'flex';
};

// AUTH
async function checkAuth() {
    const r = await fetch('/api/me', {headers:{'Authorization':token}});
    if(r.ok) { setupUser(await r.json()); }
    else { document.getElementById('auth-screen').style.display = 'flex'; }
}
function setupUser(d) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('u-name').innerText = d.user.username;
    if(d.user.isPremium) {
        const b = document.getElementById('u-badge');
        b.innerText="VIP"; b.className="badge premium";
    }
    loadDaily();
}
function toggleAuth() {
    const l=document.getElementById('login-form'), r=document.getElementById('reg-form');
    if(l.style.display==='none'){l.style.display='block';r.style.display='none'}
    else{l.style.display='none';r.style.display='block'}
}
async function login() {
    const u=document.getElementById('l-user').value, p=document.getElementById('l-pass').value;
    const r=await fetch('/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const d=await r.json();
    if(d.token){localStorage.setItem('token',d.token);token=d.token;checkAuth();} else alert(d.error);
}
async function register() {
    const u=document.getElementById('r-user').value, p=document.getElementById('r-pass').value;
    const r=await fetch('/api/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    if(r.ok){alert("ОК! Войдите");toggleAuth();} else alert("Ошибка");
}

// NAVIGATION
function switchTab(t, el) {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(`tab-${t}`).classList.add('active');
    document.querySelectorAll('.nav-i').forEach(n=>n.classList.remove('active'));
    if(el && !el.classList.contains('nav-c')) el.classList.add('active');
    
    if(t==='scan') startScan(); else stopScan();
    if(t==='map') setTimeout(initMap,200);
}

// SCANNER
function startScan() {
    if(scanner) return;
    scanner = new Html5Qrcode("reader");
    scanner.start({facingMode:"environment"}, {fps:10,qrbox:250}, onScan);
}
function stopScan() { if(scanner) scanner.stop().then(()=>{scanner.clear();scanner=null}); }

async function onScan(code) {
    stopScan();
    document.getElementById('res-modal').style.display='flex';
    document.getElementById('r-title').innerText = "Анализ...";
    document.getElementById('r-badge').style.display='none';
    
    const r = await fetch('/api/barcode', {method:'POST',headers:{'Content-Type':'application/json','Authorization':token},body:JSON.stringify({code})});
    if(r.status===403) return openPaywall();
    
    const d=await r.json();
    if(!d.found || !d.hasIngredients) {
        if(confirm("Товар не найден или нет состава. Сфотографировать?")) document.getElementById('file').click();
        else closeModal('res-modal');
        return;
    }
    showRes(d);
}

async function manualSearch() {
    const c=document.getElementById('barcode-in').value; if(c) onScan(c);
}

document.getElementById('file').addEventListener('change', async(e)=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=async(ev)=>{
        document.getElementById('res-modal').style.display='flex';
        document.getElementById('r-title').innerText="Фото...";
        
        const r=await fetch('/api/photo', {method:'POST',headers:{'Content-Type':'application/json','Authorization':token},body:JSON.stringify({image:ev.target.result})});
        if(r.status===403) return openPaywall();
        const d=await r.json(); d.name="Фото состава";
        showRes(d);
    };
    rd.readAsDataURL(f);
});

function showRes(d) {
    document.getElementById('res-modal').style.display='flex';
    document.getElementById('r-title').innerText=d.name;
    document.getElementById('r-reason').innerText=d.reason;
    const b=document.getElementById('r-badge');
    b.style.display='inline-block';
    b.className='res-badge '+(d.status==='HALAL'?'halal':d.status==='HARAM'?'haram':'mushbooh');
    b.innerText=d.status;
    const l=document.getElementById('r-ingr'); l.innerHTML='';
    if(d.ingredients_detected) d.ingredients_detected.forEach(i=>l.innerHTML+=`<span style="color:red;margin-right:5px">${i}</span>`);
}

// --- MAP & QIBLA (ИСПРАВЛЕННАЯ) ---
function initMap() {
    // Если карта уже есть, просто обновляем её размеры (фикс серого экрана)
    if(map) { 
        setTimeout(() => map.invalidateSize(), 100);
        return; 
    }

    // 1. Создаем карту (Центр - Душанбе)
    map = L.map('map').setView([38.5598, 68.7870], 13);

    // 2. Добавляем слой (Картинки улиц)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // 3. Пытаемся найти пользователя
    locateUser();
}

function locateUser() {
    // Показываем "Ищу..."
    const qText = document.getElementById('q-text');
    if(qText) qText.innerText = "Ищем спутники...";

    if(!navigator.geolocation) {
        alert("Ваш телефон не поддерживает GPS");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (p) => {
            const {latitude: lat, longitude: lng} = p.coords;
            
            // Летим к юзеру
            map.setView([lat, lng], 16);
            
            // Удаляем старый маркер если был
            if(window.userMarker) map.removeLayer(window.userMarker);
            
            // Ставим новый
            window.userMarker = L.marker([lat, lng]).addTo(map).bindPopup("Я здесь").openPopup();
            
            // Считаем Киблу и ищем мечети
            calcQibla(lat, lng);
            findMosques(lat, lng);
        },
        (err) => {
            console.log("Ошибка GPS:", err);
            // Если ошибка GPS - оставляем Душанбе, но пишем ошибку
            if(qText) qText.innerText = "Включите GPS!";
        },
        { enableHighAccuracy: true } // Просим точный GPS
    );
}
function locateUser() {
    navigator.geolocation.getCurrentPosition(p=>{
        const {latitude:lat, longitude:lng}=p.coords;
        map.setView([lat,lng],15);
        L.marker([lat,lng]).addTo(map).bindPopup("Я");
        calcQibla(lat,lng);
        findMosques(lat,lng);
    });
}
function calcQibla(lat,lng) {
    const kLat=21.4225, kLng=39.8262;
    const y=Math.sin((kLng-lng)*Math.PI/180);
    const x=Math.cos(lat*Math.PI/180)*Math.tan(kLat*Math.PI/180)-Math.sin(lat*Math.PI/180)*Math.cos((kLng-lng)*Math.PI/180);
    const q=(Math.atan2(y,x)*180/Math.PI+360)%360;
    document.getElementById('q-icon').style.transform=`rotate(${q}deg)`;
    document.getElementById('q-text').innerText=`Кибла: ${Math.round(q)}°`;
}
async function findMosques(lat,lng) {
    const q=`[out:json];node["amenity"="place_of_worship"]["religion"="muslim"](around:3000,${lat},${lng});out;`;
    const r=await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
    const d=await r.json();
    d.elements.forEach(m=>{
        L.marker([m.lat,m.lon],{icon:L.divIcon({html:'<i class="fas fa-mosque" style="color:green;font-size:24px"></i>'})})
        .addTo(map).bindPopup(`<b>${m.tags.name||"Мечеть"}</b><br><a href="https://maps.google.com/?q=${m.lat},${m.lon}" target="_blank">Маршрут</a>`);
    });
}

// CHAT
async function sendMsg() {
    const i=document.getElementById('msg-in'); const t=i.value; if(!t)return;
    addMsg(t,'user'); i.value='';
    const r=await fetch('/api/chat', {method:'POST',headers:{'Content-Type':'application/json','Authorization':token},body:JSON.stringify({message:t})});
    const d=await r.json(); addMsg(d.text,'ai');
}
function addMsg(t,c) {
    const d=document.createElement('div'); d.className=`msg ${c}`; d.innerHTML=t;
    document.getElementById('chat-box').append(d);
}

// EXTRAS
async function loadDaily() {
    const r=await fetch('/api/daily'); const d=await r.json();
    document.getElementById('d-arabic').innerText=d.arabic;
    document.getElementById('d-trans').innerText=d.translation;
    document.getElementById('d-source').innerText=d.source;
}
function openPaywall() { document.getElementById('pay-modal').style.display='flex'; }
function closeModal(id) { 
    document.getElementById(id).style.display='none'; 
    if(id==='res-modal' && document.getElementById('tab-scan').classList.contains('active')) startScan();
}
async function buyPremium() {
    await fetch('/api/buy', {method:'POST',headers:{'Authorization':token}});
    alert("Оплата прошла!"); location.reload();
}
// Функция копирования номера карты
function copyCard() {
    const num = document.getElementById('card-number').innerText;
    navigator.clipboard.writeText(num).then(() => alert("Номер карты скопирован!"));
}

// Открытие твоего Телеграма
function openTelegram() {
    // ЗАМЕНИ 'Abdulla_TG' НА СВОЙ НИК В ТЕЛЕГРАМЕ (без @)
    const myTelegram = "Abdulla_TG"; 
    // Мы передаем имя пользователя, чтобы ты знал, кого активировать
    const username = document.getElementById('u-name').innerText;
    const text = `Ас-саляму алейкум! Я оплатил Premium для пользователя: ${username}. Вот чек.`;
    
    window.open(`https://t.me/${myTelegram}?text=${encodeURIComponent(text)}`, '_blank');
}