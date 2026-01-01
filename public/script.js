// --- НАВИГАЦИЯ ---
function switchTab(tabName, element) {
    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    // Показываем нужный
    document.getElementById(`screen-${tabName}`).classList.add('active');
    
    // Подсветка кнопок
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
}

// --- 1. ЛОГИКА "ХАДИС ДНЯ" ---
async function loadDaily() {
    try {
        const res = await fetch('/api/daily');
        const data = await res.json();
        
        document.getElementById('daily-source').innerText = data.source || "Коран/Сунна";
        document.getElementById('daily-arabic').innerText = data.arabic || "";
        document.getElementById('daily-translation').innerText = data.translation;
    } catch (e) {
        console.error(e);
    }
}
// Загружаем при старте
window.onload = loadDaily;

// --- 2. ЛОГИКА СКАНЕРА ---
const fileInput = document.getElementById('file-input');
const previewImg = document.getElementById('preview-img');
const resultCard = document.getElementById('scan-result');
const scanBtn = document.getElementById('scan-btn');
let currentImage = null;

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            currentImage = ev.target.result;
            previewImg.src = currentImage;
            previewImg.style.display = 'block';
            document.getElementById('camera-icon').style.display = 'none';
            resultCard.style.display = 'none';
        }
        reader.readAsDataURL(file);
    }
});

async function analyzeImage() {
    if (!currentImage) return alert("Сначала сделайте фото!");
    
    scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Анализ...';
    
    try {
        const res = await fetch('/api/scan', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ image: currentImage })
        });
        const data = await res.json();
        
        resultCard.style.display = 'block';
        const badge = document.getElementById('res-badge');
        
        if (data.status === 'HALAL') {
            badge.className = 'badge bg-halal'; badge.innerText = 'ХАЛЯЛЬ';
        } else if (data.status === 'HARAM') {
            badge.className = 'badge bg-haram'; badge.innerText = 'ХАРАМ';
        } else {
            badge.className = 'badge bg-mushbooh'; badge.innerText = 'СОМНИТЕЛЬНО';
        }
        
        document.getElementById('res-title').innerText = data.title || "Продукт";
        document.getElementById('res-reason').innerText = data.reason;
        
    } catch (e) {
        alert("Ошибка. Попробуйте еще раз.");
    } finally {
        scanBtn.innerHTML = '<i class="fas fa-search"></i> Проверить состав';
    }
}

// --- 3. ЛОГИКА ЧАТА ---
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');

async function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    addMsg(text, 'msg-user');
    chatInput.value = '';
    
    // Индикатор печати
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message msg-ai';
    loadingDiv.innerText = 'Имам пишет...';
    chatBox.appendChild(loadingDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        
        chatBox.removeChild(loadingDiv);
        addMsg(data.text, 'msg-ai');
    } catch (e) {
        chatBox.removeChild(loadingDiv);
        addMsg("Ошибка связи", 'msg-ai');
    }
}

function addMsg(text, cls) {
    const div = document.createElement('div');
    div.className = `message ${cls}`;
    div.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}