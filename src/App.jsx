import React, { useState, useEffect } from 'react';
import { Sparkles, Settings as SettingsIcon, BookOpen, MessageSquare, LayoutDashboard, Database } from 'lucide-react';

import MainDashboard from './components/MainDashboard';
import SmartModes from './components/SmartModes';
import PersonalDictionary from './components/PersonalDictionary';
import AiAssistant from './components/AiAssistant';
import Settings from './components/Settings';
import RecordingOverlay from './components/RecordingOverlay';
import ModelsManager from './components/ModelsManager';
import SetupWizard from './components/SetupWizard';

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
        if (['dashboard', 'modes', 'dictionary', 'models', 'assistant', 'settings'].includes(page)) {
          setCurrentTab(page);
        }
      });
      return () => unsubNav();
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
              color: currentTab === 'dashboard' ? '#fff' : 'var(--text-secondary)',
              background: currentTab === 'dashboard' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              borderLeft: currentTab === 'dashboard' ? '3px solid var(--accent-blue)' : 'none',
              transition: 'var(--transition-smooth)'
            }}
          >
            <LayoutDashboard size={16} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>Dashboard</span>
          </button>

          <button 
            onClick={() => setCurrentTab('modes')}
            className="glass"
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left',
              color: currentTab === 'modes' ? '#fff' : 'var(--text-secondary)',
              background: currentTab === 'modes' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
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
              color: currentTab === 'dictionary' ? '#fff' : 'var(--text-secondary)',
              background: currentTab === 'dictionary' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
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
              color: currentTab === 'models' ? '#fff' : 'var(--text-secondary)',
              background: currentTab === 'models' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
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
              color: currentTab === 'assistant' ? '#fff' : 'var(--text-secondary)',
              background: currentTab === 'assistant' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
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
                color: currentTab === 'settings' ? '#fff' : 'var(--text-secondary)',
                background: currentTab === 'settings' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
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
        <div style={{ flex: 1, overflow: 'hidden', background: '#1c1c1e' }}>
          {currentTab === 'dashboard' && (
            <MainDashboard 
              config={config} 
              dictionary={dictionary} 
              modes={modes} 
              history={history}
              onUpdateHistory={handleSaveHistory} 
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
