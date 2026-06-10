import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Settings as SettingsIcon, BookOpen, MessageSquare, LayoutDashboard, Database, Mic, ArrowUpRight } from 'lucide-react';

import MainDashboard from './components/MainDashboard';
import TranscribeAudio from './components/TranscribeAudio';
import SmartModes from './components/SmartModes';
import PersonalDictionary from './components/PersonalDictionary';
import AiAssistant from './components/AiAssistant';
import Settings from './components/Settings';
import RecordingOverlay from './components/RecordingOverlay';
import ModelsManager from './components/ModelsManager';
import SetupWizard from './components/SetupWizard';

import { AudioRecorder, encodeWAV } from './utils/audioHelper';
import { whisperManager } from './utils/whisperModel';

const DEFAULT_MODES = [
  { id: 'raw', name: 'Raw Spoken', description: 'Outputs exactly what you spoke without editing.', prompt: 'Output the exact text transcript. Do not change anything.' },
  { id: 'refine', name: 'Smart Refine', description: 'Fixes grammatical mistakes, typos, and phrasing.', prompt: 'Correct any spelling, formatting, typos, and grammatical errors. Improve flow and structure, but keep the original language, style, and tone.' },
  { id: 'email', name: 'Professional Email', description: 'Formats the transcript as a polite business email.', prompt: 'Rewrite the following text into a formal, clear, and professional business email. Keep it polite, clean, and structured.' },
  { id: 'bullets', name: 'Bullet Summary', description: 'Summarizes key points in a bulleted list.', prompt: 'Analyze the text and summarize the key ideas, thoughts, and actionable items as a clean, structured bulleted list.' },
  { id: 'trans-en', name: 'Translate to English', description: 'Translates spoken text directly to English.', prompt: 'Translate the transcript into natural-sounding English. Correct grammar and formatting in the process.' }
];

export default function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isOverlay, setIsOverlay] = useState(false);

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('voiceink_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.engine === 'webspeech') {
          parsed.engine = 'whisper';
        }
        if (!parsed.hfMirror) {
          parsed.hfMirror = 'https://hf-mirror.com';
        }
        if (!parsed.runtime) {
          parsed.runtime = 'web';
        }
        if (!parsed.customCmdTemplate) {
          parsed.customCmdTemplate = 'whisper-ct2 {input_file} --model {model_path} --language {lang}';
        }
        if (!parsed.whisperCppBackend) {
          parsed.whisperCppBackend = 'cuda12';
        }
        if (!parsed.pasteMethod) {
          parsed.pasteMethod = 'ctrl_v';
        }
        return parsed;
      } catch (e) {}
    }
    return { 
      engine: 'whisper', 
      language: 'ru-RU', 
      shortcut: 'Ctrl+Alt+R', 
      geminiKey: '', 
      whisperModel: 'Xenova/whisper-tiny', 
      isInitialized: false,
      hfMirror: 'https://hf-mirror.com',
      runtime: 'web',
      whisperCppBinaryPath: '',
      whisperCppModelPath: '',
      whisperCppBackend: 'cuda12',
      customCmdTemplate: 'whisper-ct2 {input_file} --model {model_path} --language {lang}',
      customCmdModelPath: '',
      pasteMethod: 'ctrl_v'
    };
  });

  const [dictionary, setDictionary] = useState(() => {
    const saved = localStorage.getItem('voiceink_dictionary');
    return saved ? JSON.parse(saved) : { btw: 'by the way', tg: 'Telegram', ai: 'AI' };
  });

  const [modes, setModes] = useState(() => {
    const saved = localStorage.getItem('voiceink_modes');
    return saved ? JSON.parse(saved) : DEFAULT_MODES;
  });

  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('voiceink_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Recording & Transcription state (lifted up for global listener persistence)
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedModeId, setSelectedModeId] = useState(() => modes[0]?.id || 'raw');
  const [waveform, setWaveform] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);
  
  const [modelStatus, setModelStatus] = useState('idle');
  const [modelMessage, setModelMessage] = useState('');
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);

  const recorderRef = useRef(null);
  const speechRecognitionRef = useRef(null);

  // Sync state refs to prevent Electron IPC stale closures
  const isRecordingRef = useRef(isRecording);
  const configRef = useRef(config);
  const dictionaryRef = useRef(dictionary);
  const transcriptionRef = useRef(transcription);
  const recordingStartTimeRef = useRef(recordingStartTime);
  const historyRef = useRef(history);
  const selectedModeIdRef = useRef(selectedModeId);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { dictionaryRef.current = dictionary; }, [dictionary]);
  useEffect(() => { transcriptionRef.current = transcription; }, [transcription]);
  useEffect(() => { recordingStartTimeRef.current = recordingStartTime; }, [recordingStartTime]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { selectedModeIdRef.current = selectedModeId; }, [selectedModeId]);

  // Check URL Hash for Overlay routing
  useEffect(() => {
    const checkHash = () => {
      setIsOverlay(window.location.hash === '#/overlay');
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Electron Navigate IPC
  useEffect(() => {
    if (window.electronAPI) {
      const unsubNav = window.electronAPI.onNavigateTo((page) => {
        if (['dashboard', 'transcribe', 'modes', 'dictionary', 'models', 'assistant', 'settings'].includes(page)) {
          setCurrentTab(page);
        }
      });
      return () => unsubNav();
    }
  }, []);

  // Update Checker Listener
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.onUpdateAvailable) {
      return window.electronAPI.onUpdateAvailable((info) => {
        setUpdateInfo(info);
      });
    }
  }, []);

  // Background Whisper Daemon Lifecycle Control
  useEffect(() => {
    let active = true;
    const initServer = async () => {
      if (window.electronAPI && config.engine === 'whisper' && config.runtime === 'whisper_cpp') {
        const { whisperCppBinaryPath, whisperCppModelPath } = config;
        if (whisperCppBinaryPath && whisperCppModelPath) {
          try {
            console.log('App: Requesting start-whisper-server background daemon...');
            await window.electronAPI.startWhisperServer({
              binaryPath: whisperCppBinaryPath,
              modelPath: whisperCppModelPath,
              port: 8080
            });
            if (active) console.log('App: whisper-server background daemon is ready.');
          } catch (e) {
            console.error('App: Failed to start whisper-server daemon:', e);
          }
        }
      } else if (window.electronAPI) {
        try {
          await window.electronAPI.stopWhisperServer();
        } catch (e) {}
      }
    };

    initServer();

    return () => {
      active = false;
    };
  }, [config.engine, config.runtime, config.whisperCppBinaryPath, config.whisperCppModelPath]);

  // Model initialization for web runtime
  useEffect(() => {
    if (config.engine === 'whisper') {
      const runtime = config.runtime || 'web';
      if (runtime === 'web') {
        const activeModel = config.whisperModel || 'Xenova/whisper-tiny';
        const device = config.device || 'webgpu';
        const hfMirror = config.hfMirror || 'https://hf-mirror.com';
        
        whisperManager.init(
          activeModel,
          device,
          hfMirror,
          (status, msg) => {
            setModelStatus(status);
            setModelMessage(msg);
          },
          (progress) => {
            setModelMessage(`Downloading weights: ${progress.progress}%`);
          }
        );
      } else {
        // Terminate web ASR worker model compiler to free up WebGPU and RAM resources
        whisperManager.destroy();

        if (runtime === 'whisper_cpp') {
          if (config.whisperCppBinaryPath && config.whisperCppModelPath) {
            setModelStatus('ready');
            setModelMessage('Native whisper.cpp engine is configured.');
          } else {
            setModelStatus('error');
            setModelMessage('Error: Paths are not configured. Go to Settings.');
          }
        } else if (runtime === 'custom_cmd') {
          if (config.customCmdTemplate) {
            setModelStatus('ready');
            setModelMessage('Custom command template is configured.');
          } else {
            setModelStatus('error');
            setModelMessage('Error: Custom command template is empty. Go to Settings.');
          }
        }
      }
    }
  }, [
    config.engine,
    config.runtime,
    config.whisperModel,
    config.device,
    config.hfMirror,
    config.whisperCppBinaryPath,
    config.whisperCppModelPath,
    config.customCmdTemplate,
    config.customCmdModelPath
  ]);

  // Global recording shortcut & trigger listeners
  useEffect(() => {
    if (window.electronAPI) {
      const unsubToggle = window.electronAPI.onRecordingToggled((state) => {
        if (state) {
          startRecording();
        } else {
          stopRecording();
        }
      });

      const unsubStart = window.electronAPI.onStartRecording(() => {
        startRecording();
      });

      const unsubStop = window.electronAPI.onStopRecording(() => {
        stopRecording();
      });

      return () => {
        unsubToggle();
        unsubStart();
        unsubStop();
      };
    }
  }, []);

  const startRecording = async () => {
    if (isRecordingRef.current) return;
    setIsRecording(true);
    setTranscription('Recording audio...');
    setRecordingStartTime(Date.now());
    
    if (window.electronAPI) {
      window.electronAPI.updateRecordingState(true);
    }

    recorderRef.current = new AudioRecorder();

    try {
      await recorderRef.current.start((waveData) => {
        setWaveform(waveData);
        if (window.electronAPI) {
          window.electronAPI.sendWaveformToOverlay(waveData.slice(0, 32));
        }
      });

      if (configRef.current.engine === 'webspeech') {
        runWebSpeechRecognition();
      }
    } catch (e) {
      console.error(e);
      setIsRecording(false);
      if (window.electronAPI) window.electronAPI.updateRecordingState(false);
      alert('Microphone access denied: ' + e.message);
    }
  };

  const runWebSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = configRef.current.language || 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          setTranscription(prev => prev + ' ' + event.results[i][0].transcript);
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      const display = interimTranscript || transcriptionRef.current;
      if (window.electronAPI) {
        window.electronAPI.sendTranscriptionToOverlay(display);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
    };

    recognition.start();
    speechRecognitionRef.current = recognition;
  };

  const stopRecording = async () => {
    if (!isRecordingRef.current) return;
    setIsRecording(false);
    setIsTranscribing(true);

    if (window.electronAPI) {
      window.electronAPI.updateRecordingState(false);
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
    }

    try {
      const audioBlob = await recorderRef.current.stop();
      setWaveform([]);

      let finalRawText = '';

      if (configRef.current.engine === 'whisper') {
        const runtime = configRef.current.runtime || 'web';
        
        if (runtime === 'web') {
          setTranscription('Transcribing offline using Whisper AI (Web)...');
          const langCode = configRef.current.language ? configRef.current.language.split('-')[0] : 'ru';
          
          const res = await whisperManager.transcribe(audioBlob, { 
            language: langCode,
            modelName: configRef.current.whisperModel || 'Xenova/whisper-tiny'
          });
          finalRawText = res.text;
        } else {
          setTranscription('Encoding audio and running native Whisper...');
          const wavBuffer = encodeWAV(audioBlob, 16000);
          const wavPath = await window.electronAPI.saveTempWav(wavBuffer);

          if (runtime === 'whisper_cpp') {
            setTranscription('Transcribing natively using whisper.cpp...');
            finalRawText = await window.electronAPI.transcribeWhisperCpp({
              binaryPath: configRef.current.whisperCppBinaryPath,
              modelPath: configRef.current.whisperCppModelPath,
              wavPath,
              language: configRef.current.language || 'ru-RU'
            });
          } else if (runtime === 'custom_cmd') {
            setTranscription('Transcribing using custom python command...');
            finalRawText = await window.electronAPI.transcribeCustomCmd({
              commandTemplate: configRef.current.customCmdTemplate,
              wavPath,
              modelPath: configRef.current.customCmdModelPath,
              language: configRef.current.language || 'ru-RU'
            });
          }
        }
      } else {
        await new Promise(r => setTimeout(r, 600));
        finalRawText = transcriptionRef.current.replace('Recording audio...', '').trim() || 'No audio detected.';
      }

      const cleanedText = applyDictionary(finalRawText);
      setTranscription(cleanedText);

      let formattedText = cleanedText;
      const currentMode = modes.find(m => m.id === selectedModeIdRef.current);

      if (configRef.current.geminiKey && currentMode && selectedModeIdRef.current !== 'raw') {
        setTranscription('Formatting text with Gemini AI...');
        formattedText = await formatTextWithGemini(cleanedText, currentMode.prompt);
        setTranscription(formattedText);
      }

      const duration = recordingStartTimeRef.current 
        ? Math.round((Date.now() - recordingStartTimeRef.current) / 1000) 
        : 0;
      
      const wordCount = formattedText.trim() ? formattedText.trim().split(/\s+/).filter(Boolean).length : 0;

      const historyItem = {
        timestamp: new Date().toLocaleTimeString(),
        original: cleanedText,
        formatted: formattedText,
        mode: currentMode?.name || 'Raw',
        duration: duration,
        wordCount: wordCount
      };
      
      const newHistory = [historyItem, ...historyRef.current];
      handleSaveHistory(newHistory);

      if (window.electronAPI) {
        window.electronAPI.writeClipboard(formattedText);
        window.electronAPI.sendTranscriptionToOverlay('Copied to clipboard!');
        window.electronAPI.pasteTranscription(configRef.current.pasteMethod || 'ctrl_v');
      }
    } catch (e) {
      console.error(e);
      setTranscription('Error transcribing audio: ' + e.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  const applyDictionary = (text) => {
    let result = text;
    Object.entries(dictionaryRef.current).forEach(([key, val]) => {
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      result = result.replace(regex, val);
    });
    return result;
  };

  const formatTextWithGemini = async (text, prompt) => {
    try {
      const response = await fetch(`https://generativelink.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${configRef.current.geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${prompt}\n\nTranscript: "${text}"` }]
          }]
        })
      });
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || text;
    } catch (e) {
      console.error('Gemini formatting error:', e);
      return text + ' (AI formatting failed)';
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleCopy = (text, index) => {
    if (window.electronAPI) {
      window.electronAPI.writeClipboard(text);
    } else {
      navigator.clipboard.writeText(text);
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Sync to localStorage
  const handleSaveConfig = (newConfig) => {
    setConfig(newConfig);
    localStorage.setItem('voiceink_config', JSON.stringify(newConfig));
  };

  const handleSaveDictionary = (newDict) => {
    setDictionary(newDict);
    localStorage.setItem('voiceink_dictionary', JSON.stringify(newDict));
  };

  const handleSaveModes = (newModes) => {
    setModes(newModes);
    localStorage.setItem('voiceink_modes', JSON.stringify(newModes));
  };

  const handleSaveHistory = (newHistory) => {
    setHistory(newHistory);
    localStorage.setItem('voiceink_history', JSON.stringify(newHistory));
  };

  // Window Controls for custom titlebar
  const handleMinimize = () => window.electronAPI?.minimize();
  const handleMaximize = () => window.electronAPI?.maximize();
  const handleClose = () => window.electronAPI?.close();

  const handleSetupComplete = (newConfig) => {
    setConfig(newConfig);
    localStorage.setItem('voiceink_config', JSON.stringify(newConfig));
  };

  if (!config.isInitialized) {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  if (isOverlay) {
    return <RecordingOverlay />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-dark)' }}>
      {/* Custom Titlebar */}
      <div className="titlebar">
        <div className="titlebar-title">
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-primary)' }}>VOICEINK</span>
        </div>
        <div className="titlebar-controls">
          <button className="titlebar-btn minimize" onClick={handleMinimize} title="Minimize" />
          <button className="titlebar-btn maximize" onClick={handleMaximize} title="Maximize" />
          <button className="titlebar-btn close" onClick={handleClose} title="Hide" />
        </div>
      </div>

      {/* Auto-update Banner Notification */}
      {updateInfo && (
        <div 
          style={{ 
            background: 'var(--bg-glass-hover)', 
            borderBottom: '1px solid var(--border-glass)', 
            padding: '10px 20px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            gap: '12px',
            animation: 'slide-in 0.25s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>Update Available:</span>
            <span>Version {updateInfo.version} is now available. Click to download.</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="neon-button" 
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => {
                if (window.electronAPI) {
                  window.electronAPI.openExternal(updateInfo.url);
                } else {
                  window.open(updateInfo.url, '_blank');
                }
              }}
            >
              Get Update
            </button>
            <button 
              className="neon-button secondary" 
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => setUpdateInfo(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Sidebar Navigation */}
        <div 
          className="glass"
          style={{ 
            width: '210px', 
            borderRight: '1px solid var(--border-glass)',
            padding: '20px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            background: 'var(--bg-sidebar)',
            flexShrink: 0
          }}
        >
          <div style={{ padding: '0 8px 12px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Menu
            </span>
          </div>

          <button 
            onClick={() => setCurrentTab('dashboard')}
            className="glass"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: currentTab === 'dashboard' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: currentTab === 'dashboard' ? 'var(--bg-glass-hover)' : 'transparent',
              borderLeft: currentTab === 'dashboard' ? '3px solid var(--accent-blue)' : 'none',
              transition: 'var(--transition-smooth)'
            }}
          >
            <LayoutDashboard size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Dashboard</span>
          </button>

          <button 
            onClick={() => setCurrentTab('transcribe')}
            className="glass"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: currentTab === 'transcribe' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: currentTab === 'transcribe' ? 'var(--bg-glass-hover)' : 'transparent',
              borderLeft: currentTab === 'transcribe' ? '3px solid var(--accent-blue)' : 'none',
              transition: 'var(--transition-smooth)'
            }}
          >
            <Mic size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Transcribe Audio</span>
          </button>

          <button 
            onClick={() => setCurrentTab('modes')}
            className="glass"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: currentTab === 'modes' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: currentTab === 'modes' ? 'var(--bg-glass-hover)' : 'transparent',
              borderLeft: currentTab === 'modes' ? '3px solid var(--accent-blue)' : 'none',
              transition: 'var(--transition-smooth)'
            }}
          >
            <Sparkles size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Smart Modes</span>
          </button>

          <button 
            onClick={() => setCurrentTab('dictionary')}
            className="glass"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: currentTab === 'dictionary' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: currentTab === 'dictionary' ? 'var(--bg-glass-hover)' : 'transparent',
              borderLeft: currentTab === 'dictionary' ? '3px solid var(--accent-blue)' : 'none',
              transition: 'var(--transition-smooth)'
            }}
          >
            <BookOpen size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Dictionary</span>
          </button>

          <button 
            onClick={() => setCurrentTab('models')}
            className="glass"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: currentTab === 'models' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: currentTab === 'models' ? 'var(--bg-glass-hover)' : 'transparent',
              borderLeft: currentTab === 'models' ? '3px solid var(--accent-blue)' : 'none',
              transition: 'var(--transition-smooth)'
            }}
          >
            <Database size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Models (HF)</span>
          </button>

          <button 
            onClick={() => setCurrentTab('assistant')}
            className="glass"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: currentTab === 'assistant' ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: currentTab === 'assistant' ? 'var(--bg-glass-hover)' : 'transparent',
              borderLeft: currentTab === 'assistant' ? '3px solid var(--accent-blue)' : 'none',
              transition: 'var(--transition-smooth)'
            }}
          >
            <MessageSquare size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>AI Assistant</span>
          </button>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <hr style={{ border: 'none', borderBottom: '1px solid var(--border-glass)', marginBottom: '6px' }} />
            <button 
              onClick={() => setCurrentTab('settings')}
              className="glass"
              style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left',
                color: currentTab === 'settings' ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: currentTab === 'settings' ? 'var(--bg-glass-hover)' : 'transparent',
                borderLeft: currentTab === 'settings' ? '3px solid var(--accent-blue)' : 'none',
                transition: 'var(--transition-smooth)'
              }}
            >
              <SettingsIcon size={16} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>Settings</span>
            </button>
          </div>
        </div>

        {/* Content Panel */}
        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-dark)' }}>
          {currentTab === 'dashboard' && (
            <MainDashboard 
              history={history}
              onUpdateHistory={handleSaveHistory} 
            />
          )}
          {currentTab === 'transcribe' && (
            <TranscribeAudio
              config={config}
              modes={modes}
              selectedModeId={selectedModeId}
              setSelectedModeId={setSelectedModeId}
              isRecording={isRecording}
              isTranscribing={isTranscribing}
              transcription={transcription}
              waveform={waveform}
              modelStatus={modelStatus}
              modelMessage={modelMessage}
              toggleRecording={toggleRecording}
              handleCopy={handleCopy}
              copiedIndex={copiedIndex}
            />
          )}
          {currentTab === 'modes' && (
            <SmartModes 
              modes={modes} 
              onUpdateModes={handleSaveModes} 
            />
          )}
          {currentTab === 'dictionary' && (
            <PersonalDictionary 
              dictionary={dictionary} 
              onUpdateDictionary={handleSaveDictionary} 
            />
          )}
          {currentTab === 'models' && (
            <ModelsManager 
              config={config} 
              onSaveConfig={handleSaveConfig} 
            />
          )}
          {currentTab === 'assistant' && (
            <AiAssistant 
              config={config} 
            />
          )}
          {currentTab === 'settings' && (
            <Settings 
              config={config} 
              onSaveConfig={handleSaveConfig} 
            />
          )}
        </div>

      </div>
    </div>
  );
}
