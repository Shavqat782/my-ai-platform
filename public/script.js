/* HALAL GUIDE PREMIUM - FRONTEND LOGIC
   Handles: Camera, API Calls, UI Updates, Navigation
*/

let html5QrcodeScanner = null;
let isScannerRunning = false;

// --- ИНИЦИАЛИЗАЦИЯ ---
window.onload = async () => {
    // Симуляция загрузки
    setTimeout(() => {
        document.getElementById('preloader').style.opacity = '0';
        setTimeout(() => document.getElementById('preloader').style.display = 'none', 500);
    }, 1500);

    // Загрузка Хадиса
    loadDailyHadith();
};

// --- НАВИГАЦИЯ ---
function switchTab(tabName, element) {
    // Скрываем все экраны
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    // Показываем нужный
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Обновляем кнопки внизу
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Если нажата не центральная кнопка, подсвечиваем её
    if (element && !element.classList.contains('nav-btn-center')) {
        element.classList.add('active');
    }

    // Управление сканером
    if (tabName === 'scan') {
        startScanner();
    } else {
        stopScanner();
    }
}

// --- ХАДИС ДНЯ ---
async function loadDailyHadith() {
    try {
        const res = await fetch('/api/daily');
        const data = await res.json();
        
        if (data.arabic) {
            document.getElementById('daily-arabic').innerText = data.arabic;
            document.getElementById('daily-translation').innerText = data.translation;
            document.getElementById('daily-source').innerText = data.source;
        }
    } catch (error) {
        console.error("Ошибка загрузки хадиса:", error);
    }
}

// --- ЛОГИКА СКАНЕРА ---
function startScanner() {
    if (isScannerRunning) return;

    // Конфигурация сканера
    const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };

    html5QrcodeScanner = new Html5Qrcode("reader");

    html5QrcodeScanner.start(
        { facingMode: "environment" }, 
        config, 
        onScanSuccess, 
        (errorMessage) => { 
            // Ошибки сканирования игнорируем (слишком много логов)
        }
    ).then(() => {
        isScannerRunning = true;
    }).catch(err => {
        console.error("Камера не запустилась", err);
        alert("Ошибка доступа к камере. Разрешите доступ в браузере.");
    });
}

function stopScanner() {
    if (html5QrcodeScanner && isScannerRunning) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            isScannerRunning = false;
        }).catch(err => console.log(err));
    }
}

// УСПЕШНОЕ СКАНИРОВАНИЕ
async function onScanSuccess(decodedText) {
    // Останавливаем сканер, чтобы не спамить запросами
    stopScanner();
    
    // Показываем загрузку в модалке
    showModal('loading');
    
    // Вставляем код в инпут для наглядности
    document.getElementById('barcode-input').value = decodedText;

    try {
        const res = await fetch('/api/barcode', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code: decodedText })
        });
        
        const data = await res.json();
        handleScanResult(data);

    } catch (error) {
        showModal('error', null, "Ошибка соединения с сервером.");
    }
}

// РУЧНОЙ ВВОД
async function manualSearch() {
    const code = document.getElementById('barcode-input').value;
    if (!code) return alert("Введите цифры штрихкода");
    
    showModal('loading');
    
    try {
        const res = await fetch('/api/barcode', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ code: code })
        });
        const data = await res.json();
        handleScanResult(data);
    } catch (e) {
        showModal('error', null, "Ошибка сети");
    }
}

// ЗАГРУЗКА ФОТО
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
            
            // Форматируем данные под общий вид
            data.found = true;
            data.name = "Фото состава";
            handleScanResult(data);
        } catch (e) {
            showModal('error', null, "Не удалось обработать фото.");
        }
    };
    reader.readAsDataURL(file);
});

// ОБРАБОТКА РЕЗУЛЬТАТА
function handleScanResult(data) {
    if (!data.found) {
        showModal('not_found');
        return;
    }

    if (data.hasIngredients === false) {
        showModal('photo_needed', data.name);
        return;
    }

    // Рендер результатов
    const badge = document.getElementById('res-badge');
    const title = document.getElementById('res-title');
    const reason = document.getElementById('res-reason');
    const list = document.getElementById('res-list');
    const detailsBox = document.querySelector('.details-box');

    title.innerText = data.name;
    reason.innerText = data.reason;
    list.innerHTML = ''; // Очистка списка

    // Настройка бейджа
    badge.className = 'badge'; // сброс
    if (data.status === 'HALAL') {
        badge.classList.add('halal');
        badge.innerText = '✅ ХАЛЯЛЬ';
        detailsBox.style.display = 'none'; // Прячем детали если все чисто
    } else if (data.status === 'HARAM') {
        badge.classList.add('haram');
        badge.innerText = '⛔ ХАРАМ';
        detailsBox.style.display = 'block';
    } else {
        badge.classList.add('mushbooh');
        badge.innerText = '⚠️ СОМНИТЕЛЬНО';
        detailsBox.style.display = 'block';
    }

    // Заполняем список ингредиентов (если есть)
    if (data.ingredients_detected && data.ingredients_detected.length > 0) {
        data.ingredients_detected.forEach(ing => {
            const li = document.createElement('li');
            li.innerText = ing;
            li.style.color = '#DC3545';
            li.style.fontWeight = 'bold';
            list.appendChild(li);
        });
    } else if (data.status !== 'HALAL') {
        const li = document.createElement('li');
        li.innerText = "Неуказанные добавки животного происхождения";
        list.appendChild(li);
    }

    showModal('result');
}

// --- УПРАВЛЕНИЕ МОДАЛЬНЫМ ОКНОМ ---
function showModal(state, name = "", errorText = "") {
    const modal = document.getElementById('result-modal');
    modal.style.display = 'flex';

    // Скрываем все внутренности сначала, потом покажем нужное
    // В данном упрощенном варианте мы просто меняем тексты
    
    const title = document.getElementById('res-title');
    const reason = document.getElementById('res-reason');
    const badge = document.getElementById('res-badge');
    const details = document.querySelector('.details-box');

    if (state === 'loading') {
        title.innerText = "Анализ...";
        reason.innerText = "Связываемся с базой данных и ИИ...";
        badge.style.display = 'none';
        details.style.display = 'none';
    } 
    else if (state === 'not_found') {
        title.innerText = "Штрихкод не найден";
        reason.innerText = "Этого товара нет в нашей базе. Пожалуйста, сфотографируйте состав.";
        badge.style.display = 'block';
        badge.className = 'badge mushbooh';
        badge.innerText = "НЕИЗВЕСТНО";
        details.style.display = 'none';
    }
    else if (state === 'photo_needed') {
        title.innerText = name;
        reason.innerText = "Товар найден, но состав не указан. Сфотографируйте этикетку.";
        badge.style.display = 'block';
        badge.className = 'badge mushbooh';
        badge.innerText = "НУЖНО ФОТО";
        details.style.display = 'none';
    }
    else if (state === 'error') {
        title.innerText = "Ошибка";
        reason.innerText = errorText;
        badge.style.display = 'none';
        details.style.display = 'none';
    }
    else if (state === 'result') {
        badge.style.display = 'inline-block';
        // Остальное уже заполнено в handleScanResult
    }
}

function closeModal() {
    document.getElementById('result-modal').style.display = 'none';
    // Если мы на вкладке сканера — перезапускаем камеру
    if (document.getElementById('tab-scan').classList.contains('active')) {
        startScanner();
    }
}

// --- ЧАТ ---
async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    // Добавляем сообщение юзера
    addMessage(text, 'user');
    input.value = '';

    // Анимация печати
    const loadingId = addMessage('Муфтий пишет...', 'ai', true);

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ message: text })
        });
        const data = await res.json();

        // Удаляем "печатает" и ставим ответ
        document.getElementById(loadingId).remove();
        addMessage(data.text, 'ai');

    } catch (e) {
        document.getElementById(loadingId).innerText = "Ошибка связи.";
    }
}

function addMessage(text, sender, isLoading = false) {
    const history = document.getElementById('chat-history');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    if (isLoading) div.id = 'loading-msg-' + Date.now();
    
    // Форматирование жирного текста Markdown
    div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    
    history.appendChild(div);
    history.scrollTop = history.scrollHeight;
    return div.id;
}