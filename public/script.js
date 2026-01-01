let html5QrcodeScanner = null;
let currentMode = 'barcode';

// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
function switchTab(tab, el) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'flex';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) el.classList.add('active');

    if(tab === 'scan' && currentMode === 'barcode') startScanner();
    else stopScanner();
}

// ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ (Штрихкод <-> Фото)
function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active'); // Простая подсветка

    if(mode === 'barcode') {
        document.getElementById('barcode-area').style.display = 'block';
        document.getElementById('photo-area').style.display = 'none';
        startScanner();
    } else {
        document.getElementById('barcode-area').style.display = 'none';
        document.getElementById('photo-area').style.display = 'block';
        stopScanner();
    }
}

// --- ЛОГИКА СКАНЕРА ШТРИХКОДОВ ---
function startScanner() {
    if(html5QrcodeScanner) return; // Уже запущен

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    html5QrcodeScanner = new Html5Qrcode("reader");
    
    html5QrcodeScanner.start({ facingMode: "environment" }, config, onScanSuccess);
}

function stopScanner() {
    if(html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }).catch(err => console.log(err));
    }
}

// КОГДА ШТРИХКОД НАЙДЕН
async function onScanSuccess(decodedText, decodedResult) {
    // Останавливаем сканер, чтобы не пищал 100 раз
    stopScanner();
    
    showResultLoading();
    
    // Вставляем цифры в поле (для красоты)
    document.getElementById('barcode-input').value = decodedText;

    try {
        const res = await fetch('/api/barcode', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code: decodedText })
        });
        const data = await res.json();
        handleResult(data);
    } catch (e) {
        alert("Ошибка сети");
        startScanner(); // Запускаем снова
    }
}

// РУЧНОЙ ПОИСК
async function manualSearch() {
    const code = document.getElementById('barcode-input').value;
    if(!code) return alert("Введите цифры!");
    
    showResultLoading();
    const res = await fetch('/api/barcode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ code: code })
    });
    const data = await res.json();
    handleResult(data);
}

// ОБРАБОТКА РЕЗУЛЬТАТА (Общая для всех)
function handleResult(data) {
    const card = document.getElementById('result-card');
    const status = document.getElementById('res-status');
    const name = document.getElementById('res-name');
    const reason = document.getElementById('res-reason');
    
    card.classList.remove('hidden');

    if (data.found === false) {
        status.className = 'status-badge status-mushbooh';
        status.innerText = 'НЕ НАЙДЕНО';
        name.innerText = 'Нет в базе';
        reason.innerText = 'Попробуйте режим "Фото Состава"';
        // Переключаем на режим фото, так как штрихкод не помог
        setTimeout(() => setMode('photo'), 2000);
        return;
    }

    if (data.needsPhoto) {
        status.className = 'status-badge status-mushbooh';
        status.innerText = 'НУЖНО ФОТО';
        name.innerText = data.name;
        reason.innerText = data.reason;
        return;
    }

    // Если ИИ дал вердикт
    if (data.status === 'HALAL') {
        status.className = 'status-badge status-halal';
        status.innerText = '✅ ХАЛЯЛЬ';
    } else if (data.status === 'HARAM') {
        status.className = 'status-badge status-haram';
        status.innerText = '⛔ ХАРАМ';
    } else {
        status.className = 'status-badge status-mushbooh';
        status.innerText = '⚠️ СОМНИТЕЛЬНО';
    }
    
    name.innerText = data.product_name || data.name || 'Товар';
    reason.innerText = data.reason;
}

// --- ЛОГИКА ФОТО (Как было раньше) ---
const fileInput = document.getElementById('file-input');
const previewImg = document.getElementById('preview-img');
let currentImage = null;

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentImage = ev.target.result;
            previewImg.src = currentImage;
            previewImg.style.display = 'block';
        }
        reader.readAsDataURL(file);
    }
});

async function analyzePhoto() {
    if(!currentImage) return alert("Сделайте фото!");
    showResultLoading();
    try {
        const res = await fetch('/api/scan-photo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ image: currentImage })
        });
        const data = await res.json();
        handleResult(data); // Используем ту же функцию показа
    } catch(e) { alert("Ошибка фото"); }
}

function showResultLoading() {
    document.getElementById('result-card').classList.remove('hidden');
    document.getElementById('res-status').innerText = 'Анализ...';
    document.getElementById('res-reason').innerText = 'Подождите...';
}

function closeResult() {
    document.getElementById('result-card').classList.add('hidden');
    if(currentMode === 'barcode') startScanner(); // Возвращаем камеру
}

// Старт при загрузке
window.onload = () => startScanner();