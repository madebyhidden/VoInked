import React, { useState, useEffect, useRef } from 'react';
import { Mic, Send, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { AudioRecorder } from '../utils/audioHelper';

export default function AiAssistant({ config }) {
  const [messages, setMessages] = useState([
    { id: '1', role: 'assistant', text: 'Привет! Я твой голосовой помощник VoiceInk. Нажми на микрофон, чтобы поговорить со мной, или напиши сообщение.' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [textToSpeech, setTextToSpeech] = useState(true);
  const [waveform, setWaveform] = useState([]);
  
  const messagesEndRef = useRef(null);
  const recorderRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendText = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText('');
    await processUserMessage(userText);
  };

  const startVoiceInput = async () => {
    try {
      setIsRecording(true);
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.start((waveData) => {
        setWaveform(waveData.slice(0, 16));
      });
    } catch (e) {
      console.error(e);
      setIsRecording(false);
      alert('Could not start microphone: ' + e.message);
    }
  };

  const stopVoiceInput = async () => {
    if (!recorderRef.current) return;
    setIsRecording(false);
    
    try {
      const audioBlob = await recorderRef.current.stop();
      if (!audioBlob) return;

      setIsThinking(true);
      
      let transcriptText = "";
      if (config.engine === 'whisper') {
        const runtime = config.runtime || 'web';
        if (runtime === 'web') {
          const { whisperManager } = await import('../utils/whisperModel');
          const res = await whisperManager.transcribe(audioBlob, { 
            language: 'ru',
            modelName: config.whisperModel || 'Xenova/whisper-tiny'
          });
          transcriptText = res.text;
        } else {
          const { encodeWAV } = await import('../utils/audioHelper');
          const wavBuffer = encodeWAV(audioBlob, 16000);
          const wavPath = await window.electronAPI.saveTempWav(wavBuffer);

          if (runtime === 'whisper_cpp') {
            transcriptText = await window.electronAPI.transcribeWhisperCpp({
              binaryPath: config.whisperCppBinaryPath,
              modelPath: config.whisperCppModelPath,
              wavPath,
              language: 'ru-RU'
            });
          } else if (runtime === 'custom_cmd') {
            transcriptText = await window.electronAPI.transcribeCustomCmd({
              commandTemplate: config.customCmdTemplate,
              wavPath,
              modelPath: config.customCmdModelPath,
              language: 'ru-RU'
            });
          }
        }
      } else {
        transcriptText = await recordWithSpeechRecognition();
      }

      if (transcriptText.trim()) {
        await processUserMessage(transcriptText);
      } else {
        setIsThinking(false);
      }
    } catch (err) {
      console.error(err);
      setIsThinking(false);
      alert('Voice transcription failed: ' + err.message);
    }
  };

  const recordWithSpeechRecognition = () => {
    return new Promise((resolve) => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        resolve("Voice chat is not supported. Please write your question.");
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.lang = config.language || 'ru-RU';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        resolve(text);
      };

      recognition.onerror = () => resolve("");
      recognition.onend = () => resolve("");

      recognition.start();
      setTimeout(() => {
        try { recognition.stop(); } catch(e) {}
      }, 5000);
    });
  };

  const processUserMessage = async (userText) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setIsThinking(true);

    let assistantResponse = "";

    if (config.geminiKey) {
      try {
        const response = await fetch(`https://generativelink.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `You are VoiceInk assistant. Answer briefly (1-3 sentences) in the same language. User asks: ${userText}` }]
            }]
          })
        });
        const data = await response.json();
        assistantResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || "Извините, не удалось получить ответ.";
      } catch (err) {
        console.error(err);
        assistantResponse = `Ошибка подключения к Gemini: ${err.message}.`;
      }
    } else {
      const lower = userText.toLowerCase();
      if (lower.includes('привет') || lower.includes('hello')) {
        assistantResponse = "Привет! Я работаю в демонстрационном режиме. Настройте API-ключ Gemini в Настройках для полноценного общения!";
      } else if (lower.includes('как дела') || lower.includes('how are you')) {
        assistantResponse = "У меня всё отлично, спасибо! Готов распознавать вашу речь и помогать с текстами.";
      } else if (lower.includes('кто ты') || lower.includes('who are you')) {
        assistantResponse = "Я голосовой ассистент приложения VoiceInk. Помогаю форматировать тексты и отвечать на ваши вопросы.";
      } else {
        assistantResponse = `Вы сказали: "${userText}". Укажите API-ключ Gemini в настройках для получения умных ответов.`;
      }
    }

    setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', text: assistantResponse }]);
    setIsThinking(false);

    if (textToSpeech) {
      speakResponse(assistantResponse);
    }
  };

  const speakResponse = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = config.language || 'ru-RU';
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="assistant-container animate-slide-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={22} style={{ color: 'var(--accent-blue)' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>AI Voice Assistant</h2>
        </div>
        <button 
          onClick={() => setTextToSpeech(!textToSpeech)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {textToSpeech ? <Volume2 size={18} style={{ color: 'var(--accent-blue)' }} /> : <VolumeX size={18} />}
          <span style={{ fontSize: '12px' }}>Voice Feedback</span>
        </button>
      </div>

      {/* Chat Area */}
      <div className="glass-panel" style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', marginBottom: '16px', background: 'rgba(0,0,0,0.15)' }}>
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            style={{ 
              display: 'flex', 
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              animation: 'fade-in 0.15s ease-out' 
            }}
          >
            <div 
              className="glass"
              style={{ 
                maxWidth: '75%', 
                padding: '10px 14px', 
                borderRadius: '8px',
                border: msg.role === 'user' ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                backgroundColor: msg.role === 'user' ? 'rgba(0, 122, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)'
              }}
            >
              <div style={{ fontSize: '13px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{msg.text}</div>
            </div>
          </div>
        ))}
        {isThinking && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="glass" style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span className="dot" style={{ width: '4px', height: '4px', backgroundColor: 'var(--accent-blue)', borderRadius: '50%', display: 'inline-block', animation: 'pulse-ring 1s infinite' }}></span>
                <span className="dot" style={{ width: '4px', height: '4px', backgroundColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'pulse-ring 1s infinite', animationDelay: '0.2s' }}></span>
                <span className="dot" style={{ width: '4px', height: '4px', backgroundColor: 'var(--text-secondary)', borderRadius: '50%', display: 'inline-block', animation: 'pulse-ring 1s infinite', animationDelay: '0.4s' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input controls */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <button 
          onMouseDown={startVoiceInput}
          onMouseUp={stopVoiceInput}
          onTouchStart={startVoiceInput}
          onTouchEnd={stopVoiceInput}
          className="neon-button"
          style={{ 
            width: '48px', 
            height: '48px', 
            borderRadius: '50%', 
            padding: 0, 
            flexShrink: 0,
            background: isRecording ? '#ff453a' : 'var(--accent-blue)'
          }}
          title="Hold to Speak"
        >
          {isRecording ? (
            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', justifyContent: 'center' }}>
              {waveform.slice(0, 5).map((w, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    width: '2px', 
                    height: `${Math.max(4, w / 10)}px`, 
                    backgroundColor: 'white', 
                    borderRadius: '1px',
                    transition: 'height 0.1s ease'
                  }} 
                />
              ))}
            </div>
          ) : (
            <Mic size={20} />
          )}
        </button>

        <form onSubmit={handleSendText} style={{ display: 'flex', gap: '10px', flex: 1 }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Задай мне вопрос здесь..." 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ flex: 1, height: '48px', borderRadius: '24px', padding: '0 18px', background: 'rgba(0,0,0,0.2)' }}
          />
          <button 
            type="submit" 
            className="neon-button" 
            style={{ width: '48px', height: '48px', borderRadius: '50%', padding: 0 }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
