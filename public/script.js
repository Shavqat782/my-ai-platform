let html5QrcodeScanner = null;

// ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК
function switchTab(tab, el) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if(el) {
        if(el.classList.contains('scan-btn-nav')) {} else { el.classList.add('active'); }
    }

    // Запускаем камеру только на вкладке скан
    if(tab === 'scan') startScanner();
    else stopScanner();
}

// ЗАГРУЗКА ДНЯ
window.onload = async () => {
    try {
        const res = await fetch('/api/daily');
        const data = await res.json();
        document.getElementById('daily-arabic').innerText = data.arabic;
        document.getElementById('daily-text').innerText = data.translation;
        document.getElementById('daily-source').innerText = data.source;
    } catch(e){}
};

// --- СКАНЕР ---
function startScanner() {
    if(html5QrcodeScanner) return;
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

async function onScanSuccess(decodedText) {
    stopScanner(); // Пауза
    showModal('loading');
    document.getElementById('barcode-input').value = decodedText;
    
    try {
        const res = await fetch('/api/barcode', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code: decodedText })
        });
        const data = await res.json();
        
        if(data.found) {
            if(data.hasIngredients) {
                showResult(data);
            } else {
                showModal('photo_needed', data.name);
            }
        } else {
            showModal('not_found');
        }
    } catch(e) { closeModal(); startScanner(); }
}

async function manualSearch() {
    const code = document.getElementById('barcode-input').value;
    if(!code) return;
    onScanSuccess(code);
}

// ФОТО
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
        showModal('loading');
        try {
            const res = await fetch('/api/scan-photo', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ image: ev.target.result })
            });
            const data = await res.json();
            showResult(data);
        } catch(e) { alert('Ошибка'); closeModal(); }
    };
    reader.readAsDataURL(file);
});

// МОДАЛКА
function showModal(type, extraName) {
    const modal = document.getElementById('result-modal');
    modal.style.display = 'flex';
    const badge = document.getElementById('res-badge');
    const title = document.getElementById('res-title');
    const text = document.getElementById('res-text');
    
    if(type === 'loading') {
        badge.style.display = 'none';
        title.innerText = 'Анализ...';
        text.innerText = 'Проверяем базу и состав...';
    } else if (type === 'not_found') {
        badge.className = 'badge bg-mushbooh'; badge.style.display = 'inline-block';
        badge.innerText = 'НЕ НАЙДЕНО';
        title.innerText = 'Штрихкод неизвестен';
        text.innerText = 'Пожалуйста, нажмите "Сфотографировать состав" ниже.';
    } else if (type === 'photo_needed') {
        badge.className = 'badge bg-mushbooh'; badge.style.display = 'inline-block';
        badge.innerText = 'НУЖНО ФОТО';
        title.innerText = extraName;
        text.innerText = 'Товар есть в базе, но нет состава. Сфотографируйте этикетку.';
    }
}

function showResult(data) {
    const modal = document.getElementById('result-modal');
    modal.style.display = 'flex';
    const badge = document.getElementById('res-badge');
    badge.style.display = 'inline-block';
    
    if(data.status === 'HALAL') {
        badge.className = 'badge bg-halal'; badge.innerText = 'ХАЛЯЛЬ';
    } else if (data.status === 'HARAM') {
        badge.className = 'badge bg-haram'; badge.innerText = 'ХАРАМ';
    } else {
        badge.className = 'badge bg-mushbooh'; badge.innerText = 'СОМНИТЕЛЬНО';
    }
    
    document.getElementById('res-title').innerText = data.name || 'Продукт';
    document.getElementById('res-text').innerText = data.reason;
}

function closeModal() {
    document.getElementById('result-modal').style.display = 'none';
    if(document.getElementById('tab-scan').classList.contains('active')) startScanner();
}

// ЧАТ
async function sendMessage() {
    const inp = document.getElementById('chat-input');
    const txt = inp.value.trim();
    if(!txt) return;
    
    const div = document.createElement('div');
    div.className = 'msg msg-user'; div.innerText = txt;
    document.getElementById('chat-box').appendChild(div);
    inp.value = '';
    
    const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ message: txt })
    });
    const data = await res.json();
    
    const divAi = document.createElement('div');
    divAi.className = 'msg msg-ai'; divAi.innerHTML = data.text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    document.getElementById('chat-box').appendChild(divAi);
}