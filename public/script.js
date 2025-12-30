let currentRole = 'general';
let isAutoVoice = false; 
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const token = localStorage.getItem('token');

if (!token) window.location.href = 'login.html';

// 1. При старте загружаем историю для 'general'
window.onload = () => selectRole('general', document.querySelector('.menu-item.active'));

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// 2. Выбор роли и ЗАГРУЗКА ИСТОРИИ
async function selectRole(role, element) {
    currentRole = role;
    
    // Визуал меню
    if (element) {
        document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
        document.getElementById('current-role-title').innerText = element.innerText;
    }
    document.getElementById('sidebar').classList.remove('open');
    
    chatBox.innerHTML = ''; // Очищаем экран

    // Если это фото-режим, просто пишем инструкцию
    if(role === 'photo') {
        addMessage("📸 Режим генерации. Опиши картинку, и я её нарисую.", 'ai');
        return;
    }

    // ЗАГРУЗКА ИСТОРИИ С СЕРВЕРА
    try {
        const res = await fetch('/api/history', {
            headers: { 'Authorization': token }
        });
        const allChats = await res.json();
        
        // Ищем чат для текущей роли
        const roleChat = allChats.find(c => c.role === role);
        
        if (roleChat && roleChat.messages.length > 0) {
            // Если есть история - показываем
            roleChat.messages.forEach(msg => addMessage(msg.text, msg.sender, false)); // false = не скроллить каждый раз
            scrollToBottom();
        } else {
            // Если нет - приветствие
            addMessage(`Режим "${role}" активирован. История пуста, начни общение!`, 'ai');
        }
    } catch (e) {
        console.error("Ошибка истории", e);
    }
}

// 3. Отправка сообщения
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage(text, 'user');
    userInput.value = '';

    // ЛОГИКА ФОТО (С КНОПКОЙ СКАЧАТЬ)
    if (currentRole === 'photo') {
        addMessage("Генерирую...", 'ai');
        const encodedPrompt = encodeURIComponent(text);
        // Используем random seed чтобы картинки были разными
        const randomSeed = Math.floor(Math.random() * 10000); 
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${randomSeed}&nologo=true`;
        
        setTimeout(() => {
            const div = document.createElement('div');
            div.classList.add('message', 'ai');
            // Добавляем картинку И кнопку скачивания
            div.innerHTML = `
                <img src="${imageUrl}" class="chat-image" alt="Art">
                <a href="${imageUrl}" target="_blank" class="download-btn"><i class="fas fa-download"></i> Открыть и Скачать</a>
            `;
            chatBox.appendChild(div);
            scrollToBottom();
            speakText("Готово!");
        }, 1500);
        return;
    }

    // ЛОГИКА ТЕКСТА
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify({ message: text, role: currentRole })
        });
        const data = await response.json();
        addMessage(data.text, 'ai');
        speakText(data.text);
    } catch (error) {
        addMessage("Ошибка сети...", 'ai');
    }
}

function addMessage(text, sender, autoScroll = true) {
    const div = document.createElement('div');
    div.classList.add('message', sender);
    // Превращаем **жирный** в <b>
    let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    // Превращаем переносы строк в <br>
    formattedText = formattedText.replace(/\n/g, '<br>');
    div.innerHTML = formattedText;
    chatBox.appendChild(div);
    if (autoScroll) scrollToBottom();
}

function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ОЗВУЧКА
function speakText(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_]/g, ''));
    const isTajik = /[ҷҳӯғӣқ]/i.test(text);
    const voices = window.speechSynthesis.getVoices();
    if (isTajik) {
        const persianVoice = voices.find(v => v.lang.includes('fa') || v.lang.includes('ir'));
        utterance.voice = persianVoice || null;
        utterance.lang = 'fa-IR';
    } else { utterance.lang = 'ru-RU'; }
    
    utterance.onend = () => { if (isAutoVoice) startListening(); };
    window.speechSynthesis.speak(utterance);
}

// МИКРОФОН
const voiceBtn = document.getElementById('voice-btn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.continuous = false;
    recognition.onstart = () => voiceBtn.classList.add('recording');
    recognition.onend = () => voiceBtn.classList.remove('recording');
    recognition.onresult = (e) => {
        userInput.value = e.results[0][0].transcript;
        sendMessage();
    };
    voiceBtn.addEventListener('click', () => {
        if (voiceBtn.classList.contains('recording')) recognition.stop();
        else recognition.start();
    });
}

function startListening() { if (recognition) setTimeout(() => recognition.start(), 500); }

userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
document.getElementById('send-btn').addEventListener('click', sendMessage);