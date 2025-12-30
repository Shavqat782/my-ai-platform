let currentRole = 'general';
let isVoiceEnabled = false; // По умолчанию МОЛЧИТ (как ты просил)
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const token = localStorage.getItem('token');
const soundBtn = document.getElementById('sound-toggle');
const themeBtn = document.getElementById('theme-toggle');

if (!token) window.location.href = 'login.html';

window.onload = () => selectRole('general', document.querySelector('.menu-item.active'));

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// --- ПЕРЕКЛЮЧАТЕЛЬ ЗВУКА ---
function toggleSound() {
    isVoiceEnabled = !isVoiceEnabled;
    if (isVoiceEnabled) {
        soundBtn.className = "fas fa-volume-up toggle-btn active";
        speakText("Озвучка включена");
    } else {
        soundBtn.className = "fas fa-volume-mute toggle-btn";
        window.speechSynthesis.cancel(); // Заткнуть сразу
    }
}

// --- ПЕРЕКЛЮЧАТЕЛЬ ТЕМЫ ---
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    themeBtn.className = isLight ? "fas fa-moon toggle-btn" : "fas fa-sun toggle-btn";
}

// --- ВЫБОР РОЛИ И ИСТОРИЯ ---
async function selectRole(role, element) {
    currentRole = role;
    if (element) {
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        document.getElementById('current-role-title').innerText = element.innerText;
    }
    document.getElementById('sidebar').classList.remove('open');
    chatBox.innerHTML = '';

    if(role === 'photo') {
        addMessage("📸 Режим генерации. Опиши картинку.", 'ai');
        return;
    }

    try {
        const res = await fetch('/api/history', { headers: { 'Authorization': token } });
        const allChats = await res.json();
        const roleChat = allChats.find(c => c.role === role);
        if (roleChat && roleChat.messages.length > 0) {
            roleChat.messages.forEach(msg => addMessage(msg.text, msg.sender, false));
            scrollToBottom();
        } else {
            addMessage(`Ас-саляму алейкум! Я готов помочь в режиме "${role}".`, 'ai');
        }
    } catch (e) { console.error(e); }
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    userInput.value = '';

    if (currentRole === 'photo') {
        addMessage("Генерирую...", 'ai');
        const encoded = encodeURIComponent(text);
        const seed = Math.floor(Math.random() * 10000);
        const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&seed=${seed}&nologo=true`;
        setTimeout(() => {
            const div = document.createElement('div');
            div.classList.add('message', 'ai');
            div.innerHTML = `<img src="${url}" class="chat-image"><a href="${url}" target="_blank" class="download-btn"><i class="fas fa-download"></i> Скачать</a>`;
            chatBox.appendChild(div);
            scrollToBottom();
            if (isVoiceEnabled) speakText("Готово");
        }, 1500);
        return;
    }

    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify({ message: text, role: currentRole })
        });
        const data = await res.json();
        addMessage(data.text, 'ai');
        if (isVoiceEnabled) speakText(data.text);
    } catch (e) { addMessage("Ошибка сети", 'ai'); }
}

function addMessage(text, sender, autoScroll = true) {
    const div = document.createElement('div');
    div.classList.add('message', sender);
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>').replace(/\n/g, '<br>');
    div.innerHTML = formatted;
    chatBox.appendChild(div);
    if (autoScroll) scrollToBottom();
}
function scrollToBottom() { chatBox.scrollTop = chatBox.scrollHeight; }

function speakText(text) {
    if (!isVoiceEnabled) return; // ЕСЛИ ВЫКЛЮЧЕНО - НЕ ГОВОРИМ
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_]/g, ''));
    const isTajik = /[ҷҳӯғӣқ]/i.test(text);
    const voices = window.speechSynthesis.getVoices();
    if (isTajik) {
        const persian = voices.find(v => v.lang.includes('fa') || v.lang.includes('ir'));
        utterance.voice = persian || null;
        utterance.lang = 'fa-IR';
    } else { utterance.lang = 'ru-RU'; }
    window.speechSynthesis.speak(utterance);
}

// Микрофон
const voiceBtn = document.getElementById('voice-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const rec = new SpeechRecognition();
    rec.lang = 'ru-RU';
    rec.onstart = () => voiceBtn.classList.add('recording');
    rec.onend = () => voiceBtn.classList.remove('recording');
    rec.onresult = (e) => { userInput.value = e.results[0][0].transcript; sendMessage(); };
    voiceBtn.addEventListener('click', () => {
        voiceBtn.classList.contains('recording') ? rec.stop() : rec.start();
        // Если нажал микрофон - временно включим звук ответа, даже если он был выключен?
        // Или оставим как есть. Пока оставим как есть (по кнопке звука).
    });
}
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
document.getElementById('send-btn').addEventListener('click', sendMessage);