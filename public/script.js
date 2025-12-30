let currentRole = 'general';
let isAutoVoice = true; // Автоматическое включение микрофона
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const token = localStorage.getItem('token');

if (!token) window.location.href = 'login.html';

// 1. Управление меню (для телефона)
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

// 2. Выбор роли
function selectRole(role, element) {
    currentRole = role;
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('current-role-title').innerText = element.innerText;
    document.getElementById('sidebar').classList.remove('open'); // Закрыть меню на телефоне
    
    chatBox.innerHTML = '';
    if(role === 'photo') {
        addMessage("📸 Режим генератора включен! Опиши, что нарисовать (например: 'Кот в космосе, киберпанк').", 'ai');
    } else {
        addMessage(`Режим "${element.innerText}" готов.`, 'ai');
    }
}

// 3. Отправка сообщения
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    userInput.value = '';

    // --- ЛОГИКА ГЕНЕРАЦИИ ФОТО ---
    if (currentRole === 'photo') {
        addMessage("Генерирую изображение...", 'ai');
        // Используем Pollinations AI (бесплатно, работает через URL)
        const encodedPrompt = encodeURIComponent(text);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;
        
        // Создаем задержку для вида
        setTimeout(() => {
            const div = document.createElement('div');
            div.classList.add('message', 'ai');
            div.innerHTML = `<img src="${imageUrl}" class="chat-image" alt="Generated Image">`;
            chatBox.appendChild(div);
            chatBox.scrollTop = chatBox.scrollHeight;
            speakText("Изображение готово.");
        }, 1500);
        return;
    }

    // --- ЛОГИКА ТЕКСТА (GEMINI) ---
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token 
            },
            body: JSON.stringify({ message: text, role: currentRole })
        });

        const data = await response.json();
        const botText = data.text;

        addMessage(botText, 'ai');
        speakText(botText); // Озвучка + Авто-старт микрофона

    } catch (error) {
        addMessage("Ошибка соединения...", 'ai');
    }
}

function addMessage(text, sender) {
    const div = document.createElement('div');
    div.classList.add('message', sender);
    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    div.innerHTML = formattedText;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 4. ОЗВУЧКА + АВТО-СЛУШАНИЕ
function speakText(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    const cleanText = text.replace(/[*#_]/g, ''); 
    utterance.text = cleanText;

    const isTajik = /[ҷҳӯғӣқ]/i.test(text);
    const voices = window.speechSynthesis.getVoices();
    
    if (isTajik) {
        const persianVoice = voices.find(v => v.lang.includes('fa') || v.lang.includes('ir'));
        utterance.voice = persianVoice || null;
        utterance.lang = 'fa-IR';
    } else {
        utterance.lang = 'ru-RU';
    }

    // САМОЕ ВАЖНОЕ: Когда бот закончил говорить — включаем микрофон
    utterance.onend = function() {
        if (isAutoVoice) {
            startListening();
        }
    };

    window.speechSynthesis.speak(utterance);
}

// 5. ГОЛОСОВОЙ ВВОД (Web Speech API)
const voiceBtn = document.getElementById('voice-btn');
const autoVoiceIcon = document.getElementById('auto-voice-icon');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false; // Останавливается после фразы

    recognition.onstart = () => {
        voiceBtn.classList.add('recording');
        autoVoiceIcon.style.color = '#D4AF37'; // Золотой значок
    };

    recognition.onend = () => {
        voiceBtn.classList.remove('recording');
        autoVoiceIcon.style.color = '#555';
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        userInput.value = transcript;
        sendMessage();
    };

    voiceBtn.addEventListener('click', () => {
        if (voiceBtn.classList.contains('recording')) recognition.stop();
        else recognition.start();
    });
}

// Функция для авто-запуска (вызываем после речи бота)
function startListening() {
    if (recognition && !voiceBtn.classList.contains('recording')) {
        setTimeout(() => recognition.start(), 500); // Пауза 0.5 сек перед включением
    }
}

// Enter для отправки
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
document.getElementById('send-btn').addEventListener('click', sendMessage);