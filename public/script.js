const token = localStorage.getItem('token');
if (!token) {
    window.location.href = 'login.html';
}
// ... дальше идет твой старый код let currentRole ...
let currentRole = 'general';
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');

// 1. Выбор ассистента
function selectRole(role, element) {
    currentRole = role;
    
    // Меняем активную кнопку в меню
    document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    // Меняем заголовок
    document.getElementById('current-role-title').innerText = element.innerText;
    
    // Очищаем чат или добавляем приветствие
    chatBox.innerHTML = '';
    addMessage(`Режим "${element.innerText}" активирован. Готов к работе!`, 'ai');
}

// 2. Отправка сообщения
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    userInput.value = '';

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': token // <--- ВОТ ЭТО ВАЖНО
            },
            body: JSON.stringify({ message: text, role: currentRole })
        });

        const data = await response.json();
        const botText = data.text;

        addMessage(botText, 'ai');
        speakText(botText); // ОЗВУЧКА

    } catch (error) {
        addMessage("Ошибка соединения с сервером...", 'ai');
    }
}

// 3. Функция добавления сообщения в чат
function addMessage(text, sender) {
    const div = document.createElement('div');
    div.classList.add('message', sender);
    
    // Преобразуем Markdown (жирный текст) в HTML теги, если нужно
    // Простая замена **текст** на <b>текст</b>
    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    div.innerHTML = formattedText;
    
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight; // Автопрокрутка вниз
}

// 4. УМНАЯ ОЗВУЧКА (Таджикский -> Персидский голос)
function speakText(text) {
    // Останавливаем, если что-то уже говорит
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Очистка от спецсимволов для чтения
    utterance.text = text.replace(/[*#_]/g, ''); 

    // Проверка на таджикские буквы (или кириллицу в таджикском контексте)
    const isTajik = /[ҷҳӯғӣқ]/i.test(text);

    const voices = window.speechSynthesis.getVoices();
    
    if (isTajik) {
        // Ищем персидский голос (Farsi)
        const persianVoice = voices.find(v => v.lang.includes('fa') || v.lang.includes('ir'));
        if (persianVoice) {
            utterance.voice = persianVoice;
            utterance.lang = 'fa-IR';
            utterance.rate = 0.9; // Чуть помедленнее для четкости
        } else {
            // Если персидского нет, используем русский
            utterance.lang = 'ru-RU';
        }
    } else {
        // Если текст русский или английский
        utterance.lang = 'ru-RU'; 
    }

    window.speechSynthesis.speak(utterance);
}

// 5. ГОЛОСОВОЙ ВВОД (Микрофон)
const voiceBtn = document.getElementById('voice-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU'; // По умолчанию слушает русский/таджикский (акцент понимает)
    
    voiceBtn.addEventListener('click', () => {
        if (voiceBtn.classList.contains('recording')) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    recognition.onstart = () => {
        voiceBtn.classList.add('recording');
    };

    recognition.onend = () => {
        voiceBtn.classList.remove('recording');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        userInput.value = transcript;
        sendMessage(); // Сразу отправляем, как договорили
    };
} else {
    voiceBtn.style.display = 'none'; // Скрываем кнопку, если браузер не поддерживает
    console.log("Ваш браузер не поддерживает Web Speech API");
}

// Отправка по Enter
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

document.getElementById('send-btn').addEventListener('click', sendMessage);