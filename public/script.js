let html5QrcodeScanner = null;

// --- НАВИГАЦИЯ ---
function switchTab(tab, el) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(n => n.classList.remove('active'));
    if(el && !el.classList.contains('nav-btn-center')) el.classList.add('active');
    
    // Карта и Сканер
    if (tab === 'scan') startScanner(); else stopScanner();
    if (tab === 'map' && typeof initMap === 'function') initMap();
}

// ЗАГРУЗКА
window.onload = () => {
    setTimeout(() => document.getElementById('preloader').style.display = 'none', 500);
    loadDaily();
};
async function loadDaily() {
    try {
        const res = await fetch('/api/daily');
        const data = await res.json();
        document.getElementById('daily-arabic').innerText = data.arabic;
        document.getElementById('daily-translation').innerText = data.translation;
        document.getElementById('daily-source').innerText = data.source;
    } catch(e){}
}

// --- СКАНЕР ---
function startScanner() {
    if(html5QrcodeScanner) return;
    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, onScanSuccess)
    .catch(() => alert("Разрешите камеру!"));
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
        
        // ЕСЛИ ТОВАР НЕ НАЙДЕН - ПРЕДЛАГАЕМ ФОТО
        if (!data.found) {
            showModal('not_found'); // <-- ВОТ ТУТ МЫ ГОВОРИМ ЮЗЕРУ СФОТКАТЬ
        } else if (!data.hasIngredients) {
            showModal('photo_needed', data.name);
        } else {
            showResult(data);
        }
    } catch(e) { showModal('error'); }
}

// РУЧНОЙ ВВОД
async function manualSearch() {
    const code = document.getElementById('barcode-input').value;
    if(code) onScanSuccess(code);
}

// ФОТО (ДЖЕМИНИ)
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
            data.found = true; data.name = "Фото состава";
            showResult(data);
        } catch(e) { showModal('error'); }
    };
    reader.readAsDataURL(file);
});

// --- ЧАТ (ИСПРАВЛЕННЫЙ) ---
async function sendMessage() {
    const inp = document.getElementById('chat-input');
    const txt = inp.value.trim();
    if(!txt) return;

    addMsg(txt, 'user');
    inp.value = '';
    const loadId = addMsg('Имам пишет...', 'ai', true);

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: txt })
        });
        const data = await res.json();
        document.getElementById(loadId).remove();
        addMsg(data.text, 'ai');
    } catch (e) {
        document.getElementById(loadId).innerText = "Ошибка сервера. Попробуйте еще раз.";
    }
}

function addMsg(text, sender, isTemp) {
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    if(isTemp) div.id = 'temp-msg';
    div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    const hist = document.getElementById('chat-history');
    hist.appendChild(div);
    hist.scrollTop = hist.scrollHeight;
    return div.id;
}

// --- УПРАВЛЕНИЕ ОКНАМИ ---
function showModal(type, name) {
    const m = document.getElementById('result-modal');
    m.style.display = 'flex';
    const t = document.getElementById('res-title');
    const r = document.getElementById('res-reason');
    const b = document.getElementById('res-badge');
    const d = document.querySelector('.details-box');
    
    // Сброс
    b.style.display = 'none'; d.style.display = 'none';

    if (type === 'loading') {
        t.innerText = "Анализ..."; r.innerText = "Подождите секунду...";
    } else if (type === 'not_found') {
        t.innerText = "Нет в базе";
        r.innerText = "Братан, этого товара нет в мировой базе. Но я могу прочитать состав! Нажми 'Фото состава'.";
        // АВТОМАТИЧЕСКИ ПРЕДЛАГАЕМ ФОТО ЧЕРЕЗ 2 СЕК
        setTimeout(() => closeModal(), 4000); 
    } else if (type === 'photo_needed') {
        t.innerText = name;
        r.innerText = "Товар нашел, но состава нет. Сфотографируй этикетку!";
    } else if (type === 'error') {
        t.innerText = "Ошибка"; r.innerText = "Попробуйте снова.";
    }
}

function showResult(data) {
    const m = document.getElementById('result-modal'); m.style.display = 'flex';
    const b = document.getElementById('res-badge'); b.style.display = 'inline-block';
    
    document.getElementById('res-title').innerText = data.name;
    document.getElementById('res-reason').innerText = data.reason;

    b.className = 'badge ' + (data.status === 'HALAL' ? 'halal' : data.status === 'HARAM' ? 'haram' : 'mushbooh');
    b.innerText = data.status === 'HALAL' ? '✅ ХАЛЯЛЬ' : data.status === 'HARAM' ? '⛔ ХАРАМ' : '⚠️ СОМНИТЕЛЬНО';
}

function closeModal() {
    document.getElementById('result-modal').style.display = 'none';
    if(document.getElementById('tab-scan').classList.contains('active')) startScanner();
}