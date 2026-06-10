import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Cpu, Key, HelpCircle, Save, FolderOpen, Download, Loader2, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { whisperManager } from '../utils/whisperModel';

export default function Settings({ config, onSaveConfig }) {
  const [engine, setEngine] = useState(config.engine === 'webspeech' ? 'whisper' : (config.engine || 'whisper'));
  const [geminiKey, setGeminiKey] = useState(config.geminiKey || '');
  const [language, setLanguage] = useState(config.language || 'ru-RU');
  const [shortcut, setShortcut] = useState(config.shortcut || 'Ctrl+Alt+R');
  const [device, setDevice] = useState(config.device || 'webgpu');
  const [hfMirror, setHfMirror] = useState(config.hfMirror || 'https://hf-mirror.com');
  const [runtime, setRuntime] = useState(config.runtime || 'web');
  const [whisperCppBinaryPath, setWhisperCppBinaryPath] = useState(config.whisperCppBinaryPath || '');
  const [whisperCppModelPath, setWhisperCppModelPath] = useState(config.whisperCppModelPath || '');
  const [whisperCppBackend, setWhisperCppBackend] = useState(config.whisperCppBackend || 'cuda12');
  const [customCmdTemplate, setCustomCmdTemplate] = useState(config.customCmdTemplate || 'whisper-ct2 {input_file} --model {model_path} --language {lang}');
  const [customCmdModelPath, setCustomCmdModelPath] = useState(config.customCmdModelPath || '');
  const [pasteMethod, setPasteMethod] = useState(config.pasteMethod || 'ctrl_v');
  const [diagnosticStatus, setDiagnosticStatus] = useState('');
  const [gpuInfo, setGpuInfo] = useState('Checking GPU specs...');

  // Native automatic installation states
  const [nativeInstallStatus, setNativeInstallStatus] = useState('idle');
  const [nativeInstallProgress, setNativeInstallProgress] = useState(0);
  const [nativeInstallMsg, setNativeInstallMsg] = useState('');
  const [selectedModel, setSelectedModel] = useState(config.whisperModel || 'Xenova/whisper-tiny');
  const [modelDownloaded, setModelDownloaded] = useState(false);
  const [engineInstalled, setEngineInstalled] = useState(false);
  
  // Status showing saved
  const [isSavedTextVisible, setIsSavedTextVisible] = useState(false);

  const updateConfig = (updatedFields) => {
    const newConfig = {
      engine: updatedFields.engine !== undefined ? updatedFields.engine : engine,
      geminiKey: updatedFields.geminiKey !== undefined ? updatedFields.geminiKey : geminiKey,
      language: updatedFields.language !== undefined ? updatedFields.language : language,
      shortcut: updatedFields.shortcut !== undefined ? updatedFields.shortcut : shortcut,
      device: updatedFields.device !== undefined ? updatedFields.device : device,
      hfMirror: updatedFields.hfMirror !== undefined ? updatedFields.hfMirror : hfMirror,
      runtime: updatedFields.runtime !== undefined ? updatedFields.runtime : runtime,
      whisperCppBinaryPath: updatedFields.whisperCppBinaryPath !== undefined ? updatedFields.whisperCppBinaryPath : whisperCppBinaryPath,
      whisperCppModelPath: updatedFields.whisperCppModelPath !== undefined ? updatedFields.whisperCppModelPath : whisperCppModelPath,
      whisperCppBackend: updatedFields.whisperCppBackend !== undefined ? updatedFields.whisperCppBackend : whisperCppBackend,
      customCmdTemplate: updatedFields.customCmdTemplate !== undefined ? updatedFields.customCmdTemplate : customCmdTemplate,
      customCmdModelPath: updatedFields.customCmdModelPath !== undefined ? updatedFields.customCmdModelPath : customCmdModelPath,
      whisperModel: updatedFields.whisperModel !== undefined ? updatedFields.whisperModel : selectedModel,
      pasteMethod: updatedFields.pasteMethod !== undefined ? updatedFields.pasteMethod : pasteMethod,
      isInitialized: true
    };
    onSaveConfig(newConfig);
    
    // Show visual confirmation
    setIsSavedTextVisible(true);
    setTimeout(() => {
      setIsSavedTextVisible(false);
    }, 1500);
  };

  const performHardwareCheck = async () => {
    try {
      if (window.electronAPI) {
        const userData = await window.electronAPI.getUserDataPath();
        
        // 1. Check Engine
        let engineOk = false;
        if (whisperCppBinaryPath) {
          engineOk = await window.electronAPI.checkFileExists(whisperCppBinaryPath);
        }
        if (!engineOk) {
          const currentBackend = config.whisperCppBackend || 'cuda12';
          const binNames = ['whisper-cli.exe', 'whisper-cli', 'main.exe', 'main'];
          for (const name of binNames) {
            const defaultBinPath = `${userData}/bin/${currentBackend}/Release/${name}`.replace(/\\/g, '/');
            let exists = await window.electronAPI.checkFileExists(defaultBinPath);
            if (!exists) {
              const altBinPath = `${userData}/bin/${currentBackend}/${name}`.replace(/\\/g, '/');
              exists = await window.electronAPI.checkFileExists(altBinPath);
              if (exists) {
                engineOk = true;
                setWhisperCppBinaryPath(altBinPath);
                updateConfig({ whisperCppBinaryPath: altBinPath });
                break;
              }
            } else {
              engineOk = true;
              setWhisperCppBinaryPath(defaultBinPath);
              updateConfig({ whisperCppBinaryPath: defaultBinPath });
              break;
            }
          }
        }
        setEngineInstalled(engineOk);

        // 2. Check Model
        let modelFile = 'ggml-base.bin';
        const lowerName = selectedModel.toLowerCase();
        if (lowerName.includes('large-v3-turbo-q5_0') || lowerName.includes('large-v3-turbo-q5') || lowerName.includes('q5_0')) modelFile = 'ggml-large-v3-turbo-q5_0.bin';
        else if (lowerName.includes('large-v3-turbo')) modelFile = 'ggml-large-v3-turbo.bin';
        else if (lowerName.includes('large-v3')) modelFile = 'ggml-large-v3.bin';
        else if (lowerName.includes('large')) modelFile = 'ggml-large-v3-turbo-q5_0.bin';
        else if (lowerName.includes('medium')) modelFile = 'ggml-medium.bin';
        else if (lowerName.includes('small')) modelFile = 'ggml-small.bin';
        else if (lowerName.includes('base')) modelFile = 'ggml-base.bin';
        else if (lowerName.includes('tiny')) modelFile = 'ggml-tiny.bin';

        let modelOk = false;
        if (whisperCppModelPath && whisperCppModelPath.endsWith(modelFile)) {
          modelOk = await window.electronAPI.checkFileExists(whisperCppModelPath);
        } else {
          // Check in default models path
          const defaultModelPath = `${userData}/models/${modelFile}`.replace(/\\/g, '/');
          modelOk = await window.electronAPI.checkFileExists(defaultModelPath);
          if (modelOk) {
            setWhisperCppModelPath(defaultModelPath);
            updateConfig({ whisperCppModelPath: defaultModelPath });
          }
        }
        setModelDownloaded(modelOk);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    performHardwareCheck();
  }, [whisperCppBinaryPath, whisperCppModelPath, selectedModel, whisperCppBackend]);

  const handleStartNativeSetup = async () => {
    setNativeInstallStatus('installing');
    setNativeInstallProgress(0);
    setNativeInstallMsg('Запуск автоматической установки...');

    // Subscribe to IPC progress events
    const unsubscribeProgress = window.electronAPI.onNativeDownloadProgress((data) => {
      setNativeInstallProgress(data.progress);
      setNativeInstallMsg(data.message);
    });

    try {
      const result = await window.electronAPI.setupNativeWhisper({
        modelName: selectedModel,
        hfMirror: hfMirror,
        backend: whisperCppBackend
      });
      
      setNativeInstallStatus('completed');
      setNativeInstallMsg('Установка завершена успешно!');
      setNativeInstallProgress(100);

      // Populate paths automatically
      setWhisperCppBinaryPath(result.binaryPath);
      setWhisperCppModelPath(result.modelPath);

      // Auto-save settings immediately
      const newConfig = {
        engine,
        geminiKey,
        language,
        shortcut,
        device,
        hfMirror,
        runtime,
        whisperCppBinaryPath: result.binaryPath,
        whisperCppModelPath: result.modelPath,
        whisperCppBackend: whisperCppBackend,
        customCmdTemplate,
        customCmdModelPath,
        whisperModel: selectedModel,
        isInitialized: true
      };
      onSaveConfig(newConfig);
    } catch (err) {
      console.error(err);
      setNativeInstallStatus('error');
      setNativeInstallMsg(`Ошибка установки: ${err.message || err}`);
    } finally {
      unsubscribeProgress();
    }
  };

  useEffect(() => {
    setEngine(config.engine === 'webspeech' ? 'whisper' : (config.engine || 'whisper'));
    setGeminiKey(config.geminiKey || '');
    setLanguage(config.language || 'ru-RU');
    setShortcut(config.shortcut || 'Ctrl+Alt+R');
    setDevice(config.device || 'webgpu');
    setHfMirror(config.hfMirror || 'https://hf-mirror.com');
    setRuntime(config.runtime || 'web');
    setWhisperCppBinaryPath(config.whisperCppBinaryPath || '');
    setWhisperCppModelPath(config.whisperCppModelPath || '');
    setWhisperCppBackend(config.whisperCppBackend || 'cuda12');
    setCustomCmdTemplate(config.customCmdTemplate || 'whisper-ct2 {input_file} --model {model_path} --language {lang}');
    setCustomCmdModelPath(config.customCmdModelPath || '');
    setPasteMethod(config.pasteMethod || 'ctrl_v');
    if (config.whisperModel) {
      setSelectedModel(config.whisperModel);
    }
  }, [config]);

  const handleBrowseWhisperCppBinary = async () => {
    try {
      const path = await window.electronAPI.selectFile({
        title: 'Select whisper.cpp Main Binary (main.exe / main)',
        filters: [{ name: 'Executables', extensions: ['exe', 'bin', 'sh', '*'] }]
      });
      if (path) {
        setWhisperCppBinaryPath(path);
        updateConfig({ whisperCppBinaryPath: path });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseWhisperCppModel = async () => {
    try {
      const path = await window.electronAPI.selectFile({
        title: 'Select whisper.cpp GGML Model (ggml-model.bin)',
        filters: [{ name: 'GGML Models', extensions: ['bin', '*'] }]
      });
      if (path) {
        setWhisperCppModelPath(path);
        updateConfig({ whisperCppModelPath: path });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseCustomCmdModel = async () => {
    try {
      const path = await window.electronAPI.selectFolder({
        title: 'Select Custom CLI Model Folder'
      });
      if (path) {
        setCustomCmdModelPath(path);
        updateConfig({ customCmdModelPath: path });
      } else {
        const filePath = await window.electronAPI.selectFile({
          title: 'Select Custom CLI Model File'
        });
        if (filePath) {
          setCustomCmdModelPath(filePath);
          updateConfig({ customCmdModelPath: filePath });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    async function queryGpu() {
      let isSupported = false;
      let name = 'Not detected';
      if (navigator.gpu) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            isSupported = true;
            const info = adapter.info || (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : null);
            name = info ? (info.device || info.description || info.vendor || 'Generic WebGPU Device') : 'Generic WebGPU Device';
          }
        } catch (e) {}
      }
      if (name === 'Not detected' || !isSupported) {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
              name = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            }
          }
        } catch (e) {}
      }
      setGpuInfo(name + (isSupported ? ' (WebGPU Accelerated)' : ' (No WebGPU/CPU Fallback)'));
    }
    queryGpu();
  }, []);

  const handleRunDiagnostic = async () => {
    setDiagnosticStatus('Running diagnostics...');
    try {
      if (!navigator.gpu) {
        setDiagnosticStatus('Failure: WebGPU API (navigator.gpu) is not supported in this environment. Falling back to CPU.');
        return;
      }
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        setDiagnosticStatus('Failure: Could not request WebGPU adapter. Drivers might be outdated.');
        return;
      }
      const deviceObj = await adapter.requestDevice();
      if (!deviceObj) {
        setDiagnosticStatus('Failure: WebGPU adapter was found, but failed to initialize logical device.');
        return;
      }
      setDiagnosticStatus(`Success: GPU is fully functional! Detected adapter: ${gpuInfo}`);
    } catch (e) {
      setDiagnosticStatus(`Failure: WebGPU test crashed: ${e.message}`);
    }
  };

  const handleRuntimeChange = (val) => {
    setRuntime(val);
    updateConfig({ runtime: val });
  };

  const handleBackendChange = (val) => {
    setWhisperCppBackend(val);
    updateConfig({ whisperCppBackend: val });
  };

  const handleLanguageChange = (val) => {
    setLanguage(val);
    updateConfig({ language: val });
  };

  const handleHfMirrorChange = (val) => {
    setHfMirror(val);
    updateConfig({ hfMirror: val });
  };

  const handleDeviceChange = (val) => {
    setDevice(val);
    updateConfig({ device: val });
  };

  const handlePasteMethodChange = (val) => {
    setPasteMethod(val);
    updateConfig({ pasteMethod: val });
  };

  const handleModelChange = async (val) => {
    setSelectedModel(val);
    if (runtime === 'whisper_cpp') {
      const userData = await window.electronAPI.getUserDataPath();
      let modelFile = 'ggml-base.bin';
      const lowerName = val.toLowerCase();
      if (lowerName.includes('large-v3-turbo-q5_0') || lowerName.includes('large-v3-turbo-q5') || lowerName.includes('q5_0')) modelFile = 'ggml-large-v3-turbo-q5_0.bin';
      else if (lowerName.includes('large-v3-turbo')) modelFile = 'ggml-large-v3-turbo.bin';
      else if (lowerName.includes('large-v3')) modelFile = 'ggml-large-v3.bin';
      else if (lowerName.includes('large')) modelFile = 'ggml-large-v3-turbo-q5_0.bin';
      else if (lowerName.includes('medium')) modelFile = 'ggml-medium.bin';
      else if (lowerName.includes('small')) modelFile = 'ggml-small.bin';
      else if (lowerName.includes('base')) modelFile = 'ggml-base.bin';
      else if (lowerName.includes('tiny')) modelFile = 'ggml-tiny.bin';

      const modelPath = `${userData}/models/${modelFile}`.replace(/\\/g, '/');
      updateConfig({ 
        whisperModel: val, 
        whisperCppModelPath: modelPath 
      });
    } else {
      updateConfig({ whisperModel: val });
    }
  };

  const handleTextBlur = (field, val) => {
    updateConfig({ [field]: val });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  const isWebModelDownloaded = () => {
    try {
      const saved = localStorage.getItem('voiceink_installed_models');
      const installed = saved ? JSON.parse(saved) : ['Xenova/whisper-tiny'];
      return installed.includes(selectedModel);
    } catch (e) {
      return false;
    }
  };

  const startWebModelDownload = () => {
    setNativeInstallStatus('installing');
    setNativeInstallProgress(0);
    setNativeInstallMsg('Инициализация модели для Web...');

    whisperManager.init(
      selectedModel,
      device,
      hfMirror,
      (status, msg) => {
        if (status === 'ready') {
          setNativeInstallStatus('completed');
          setNativeInstallMsg('Модель успешно скачана и готова!');
          setNativeInstallProgress(100);
          
          // Add to local storage of installed models
          try {
            const saved = localStorage.getItem('voiceink_installed_models');
            const installed = saved ? JSON.parse(saved) : ['Xenova/whisper-tiny'];
            if (!installed.includes(selectedModel)) {
              localStorage.setItem('voiceink_installed_models', JSON.stringify([...installed, selectedModel]));
            }
          } catch(e){}
          
          updateConfig({ whisperModel: selectedModel });
        } else if (status === 'error') {
          setNativeInstallStatus('error');
          setNativeInstallMsg(`Ошибка: ${msg}`);
        } else {
          setNativeInstallMsg(msg);
        }
      },
      (progressData) => {
        setNativeInstallProgress(progressData.progress);
        setNativeInstallMsg(`Загрузка весов: ${progressData.progress}%`);
      }
    );
  };

  return (
    <div className="settings-container animate-slide-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SettingsIcon size={24} style={{ color: 'var(--accent-blue)' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Settings</h2>
        </div>
        {isSavedTextVisible && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#34c759', background: 'rgba(52, 199, 89, 0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px solid rgba(52, 199, 89, 0.2)' }}>
            <ShieldCheck size={14} />
            <span>Настройки сохранены автоматически</span>
          </div>
        )}
      </div>

      {/* 1. Global / General Settings */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
          General Config
        </h3>

        {/* Language Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>Transcription Language</label>
          <select 
            className="input-field"
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={{ width: '100%', background: 'rgba(0,0,0,0.25)' }}
          >
            <option value="auto">Auto Detect (Whisper only)</option>
            <option value="ru-RU">Russian (Русский)</option>
            <option value="en-US">English (US)</option>
            <option value="es-ES">Spanish (Español)</option>
            <option value="fr-FR">French (Français)</option>
            <option value="de-DE">German (Deutsch)</option>
          </select>
        </div>

        {/* Global Shortcut */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>Global Recording Hotkey</label>
          <input 
            type="text" 
            className="input-field" 
            value={shortcut} 
            onChange={(e) => setShortcut(e.target.value)}
            onBlur={(e) => handleTextBlur('shortcut', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ctrl+Alt+R"
            style={{ width: '100%', background: 'rgba(0,0,0,0.25)' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Press this key combination anywhere on your system to start or stop recording.
          </div>
        </div>

        {/* Paste Method Selection */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>Способ вставки текста (Paste Method)</label>
          <select 
            className="input-field"
            value={pasteMethod}
            onChange={(e) => handlePasteMethodChange(e.target.value)}
            style={{ width: '100%', background: 'rgba(0,0,0,0.25)' }}
          >
            <option value="ctrl_v">Ctrl + V (Стандартный)</option>
            <option value="ctrl_shift_v">Ctrl + Shift + V (Без форматирования)</option>
            <option value="shift_insert">Shift + Insert (Альтернативный)</option>
          </select>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Выберите комбинацию клавиш для автоматической вставки расшифрованного текста в активное окно.
          </div>
        </div>

        {/* Gemini API Key */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={16} /> Gemini API Key (Optional)
          </label>
          <input 
            type="password" 
            className="input-field" 
            value={geminiKey} 
            onChange={(e) => setGeminiKey(e.target.value)}
            onBlur={(e) => handleTextBlur('geminiKey', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="AIzaSy..."
            style={{ width: '100%', background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <HelpCircle size={12} /> Used for advanced writing formatting modes and the conversational AI voice assistant.
          </div>
        </div>
      </div>

      {/* 2. Runtime Engine Selection */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
          ASR Execution Runtime
        </h3>

        {/* Whisper Execution Runtime Select */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontWeight: 600, fontSize: '13px' }}>Whisper Execution Runtime</label>
          <select
            className="input-field"
            value={runtime}
            onChange={(e) => handleRuntimeChange(e.target.value)}
            style={{ width: '100%', background: 'rgba(0,0,0,0.25)' }}
          >
            <option value="web">Web (Transformers.js v3 - WebGPU/WASM)</option>
            <option value="whisper_cpp">whisper.cpp (Native C++ Binary)</option>
            <option value="custom_cmd">Custom CLI Command (Python/faster-whisper)</option>
          </select>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>
            {window.navigator.userAgent.toLowerCase().includes('mac') && (
              <span><strong>macOS Advice:</strong> Recommended: <strong>whisper.cpp</strong> (via Metal GPU on Apple Silicon) or <strong>Web (WebGPU)</strong>.</span>
            )}
            {window.navigator.userAgent.toLowerCase().includes('win') && (
              <span><strong>Windows Advice:</strong> Recommended: <strong>whisper.cpp</strong> (Native C++) or <strong>Web (WebGPU)</strong>.</span>
            )}
            {!window.navigator.userAgent.toLowerCase().includes('mac') && !window.navigator.userAgent.toLowerCase().includes('win') && (
              <span><strong>Linux Advice:</strong> Recommended: <strong>whisper.cpp</strong> or <strong>Custom CLI</strong>.</span>
            )}
          </div>
          {runtime === 'whisper_cpp' && (
            <div style={{ fontSize: '11px', color: '#34c759', marginTop: '6px', background: 'rgba(52, 199, 89, 0.08)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(52, 199, 89, 0.15)', lineHeight: 1.4 }}>
              ⚡ <strong>Авто-ускорение (Фоновый демон):</strong> VoiceInk автоматически запускает whisper.cpp в режиме фонового сервера (`whisper-server.exe`). Модель загружается в память видеокарты (VRAM) один раз при запуске приложения. Это сокращает время последующих транскрибаций до <strong>~0.4 секунды</strong> (как на Mac!), убирая 2.5-секундную задержку загрузки с диска.
            </div>
          )}
        </div>

        {/* Dynamic configuration fields based on selected runtime */}
        {runtime === 'web' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
            
            {/* Model Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px' }}>Model Size (Web)</label>
              <select 
                className="input-field"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                style={{ background: 'rgba(0,0,0,0.25)' }}
              >
                <option value="Xenova/whisper-tiny">Tiny (75MB) - Fastest</option>
                <option value="Xenova/whisper-base">Base (140MB) - Balanced</option>
                <option value="onnx-community/whisper-large-v3-turbo">Large v3 Turbo (800MB) - Most Accurate</option>
              </select>
            </div>

            {/* Model Download Check */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: '6px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Статус выбранной модели:</span>
              <span style={{ color: isWebModelDownloaded() ? '#34c759' : '#ffb703', fontWeight: 600 }}>
                {isWebModelDownloaded() ? '🟢 Скачана offline' : '🟡 Требуется загрузка'}
              </span>
            </div>

            {!isWebModelDownloaded() && (
              <button
                className="neon-button"
                style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={startWebModelDownload}
                disabled={nativeInstallStatus === 'installing'}
              >
                {nativeInstallStatus === 'installing' ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    {nativeInstallMsg} ({nativeInstallProgress}%)
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Скачать модель
                  </>
                )}
              </button>
            )}

            {/* Device configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px' }}>Hardware Acceleration (Execution Device)</label>
              <select
                className="input-field"
                value={device}
                onChange={(e) => handleDeviceChange(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.25)' }}
              >
                <option value="webgpu">GPU (WebGPU) - Highly Recommended</option>
                <option value="wasm">CPU (WASM) - CPU Fallback</option>
              </select>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Detected Graphics Card: <strong style={{ color: 'var(--text-primary)' }}>{gpuInfo}</strong>
              </div>
            </div>

            {/* HF Mirror selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontWeight: 600, fontSize: '13px' }}>Download Server (Hugging Face Mirror)</label>
              <select
                className="input-field"
                value={hfMirror}
                onChange={(e) => handleHfMirrorChange(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.25)' }}
              >
                <option value="https://hf-mirror.com">HF Mirror (Russia/CIS High-Speed Mirror)</option>
                <option value="https://huggingface.co">Hugging Face (Official Server - VPN required in RU)</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button
                className="neon-button secondary"
                onClick={handleRunDiagnostic}
                style={{ width: 'fit-content' }}
              >
                Run GPU Hardware Diagnostic
              </button>
              {diagnosticStatus && (
                <div 
                  style={{ 
                    fontSize: '12px', 
                    padding: '8px 12px', 
                    borderRadius: '6px', 
                    background: 'rgba(0,0,0,0.2)', 
                    border: '1px solid var(--border-glass)',
                    color: diagnosticStatus.startsWith('Success') ? '#34c759' : '#ff453a',
                    lineHeight: 1.4
                  }}
                >
                  {diagnosticStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {runtime === 'whisper_cpp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
            
            {/* Engine status indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: '6px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Движок whisper.cpp:</span>
              <span style={{ color: engineInstalled ? '#34c759' : '#ff453a', fontWeight: 600 }}>
                {engineInstalled ? '🟢 Установлен и готов' : '🔴 Не установлен'}
              </span>
            </div>

            {/* Backend Type Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>Движок ускорения (Backend)</label>
              <select 
                className="input-field"
                value={whisperCppBackend}
                onChange={(e) => handleBackendChange(e.target.value)}
                style={{ background: 'rgba(0,0,0,0.25)' }}
              >
                <option value="cuda12">NVIDIA GPU (CUDA 12.4) - Рекомендуется для RTX 40/30/20</option>
                <option value="cuda11">NVIDIA GPU (CUDA 11.8) - Для старых видеокарт GTX/RTX</option>
                <option value="blas">CPU Accelerated (OpenBLAS) - Медленнее (AMD/Intel/CPU)</option>
                <option value="cpu">CPU Standard (AVX) - Базовый без оптимизаций</option>
              </select>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Обнаружен адаптер: <strong style={{ color: 'var(--text-primary)' }}>{gpuInfo}</strong>
              </div>
            </div>

            {/* Model Selection Dropdown */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600 }}>Размер модели (GGML)</label>
              <select 
                className="input-field"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                style={{ background: 'rgba(0,0,0,0.25)' }}
              >
                <option value="Xenova/whisper-tiny">Tiny (75MB) - Самая быстрая</option>
                <option value="Xenova/whisper-base">Base (140MB) - Сбалансированная</option>
                <option value="Xenova/whisper-small">Small (460MB) - Повышенная точность</option>
                <option value="Xenova/whisper-medium">Medium (1.5GB) - Высокая точность</option>
                <option value="onnx-community/whisper-large-v3-turbo-q5_0">Large v3 Turbo (Quantized Q5_0, 547MB) - Ультра-быстрая (Рекомендуется)</option>
                <option value="onnx-community/whisper-large-v3-turbo">Large v3 Turbo (800MB) - Отличная точность (Быстрая)</option>
                <option value="Xenova/whisper-large-v3">Large v3 (3.1GB) - Максимальная точность</option>
              </select>
            </div>

            {/* Model download status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: '6px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Статус выбранной модели:</span>
              <span style={{ color: modelDownloaded ? '#34c759' : '#ffb703', fontWeight: 600 }}>
                {modelDownloaded ? '🟢 Скачана offline' : '🟡 Требуется загрузка'}
              </span>
            </div>

            {/* Download/install button */}
            {(!engineInstalled || !modelDownloaded) && (
              <button
                className="neon-button"
                style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={handleStartNativeSetup}
                disabled={nativeInstallStatus === 'installing'}
              >
                {nativeInstallStatus === 'installing' ? (
                  <>
                    <Loader2 className="animate-spin" size={14} />
                    Загрузка... ({nativeInstallProgress}%)
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    {!engineInstalled ? 'Скачать движок и модель автоматически' : 'Скачать выбранную модель'}
                  </>
                )}
              </button>
            )}

            {nativeInstallStatus !== 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Прогресс установки:</span>
                  <span style={{ color: nativeInstallStatus === 'completed' ? '#34c759' : nativeInstallStatus === 'error' ? '#ff453a' : 'var(--accent-blue)' }}>
                    {nativeInstallMsg}
                  </span>
                </div>
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${nativeInstallProgress}%`, 
                      height: '100%', 
                      background: nativeInstallStatus === 'completed' ? '#34c759' : nativeInstallStatus === 'error' ? '#ff453a' : 'var(--accent-blue)',
                      transition: 'width 0.2s ease-out'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Advanced/Manual Paths toggled via HTML details */}
            <details style={{ marginTop: '4px', cursor: 'pointer', outline: 'none' }}>
              <summary style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', userSelect: 'none' }}>
                Дополнительно: Ручная настройка путей к файлам
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Путь к бинарнику whisper.cpp (main.exe / main)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={whisperCppBinaryPath} 
                      onChange={(e) => setWhisperCppBinaryPath(e.target.value)}
                      onBlur={(e) => handleTextBlur('whisperCppBinaryPath', e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={window.navigator.userAgent.toLowerCase().includes('win') ? "e.g. C:\\whisper.cpp\\main.exe" : "/usr/local/bin/whisper-cpp"}
                      style={{ flex: 1 }}
                    />
                    <button 
                      onClick={handleBrowseWhisperCppBinary}
                      className="neon-button secondary"
                      style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', height: '36px', minWidth: '95px' }}
                    >
                      <FolderOpen size={14} /> Browse
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600 }}>Путь к файлу модели GGML (ggml-model.bin)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={whisperCppModelPath} 
                      onChange={(e) => setWhisperCppModelPath(e.target.value)}
                      onBlur={(e) => handleTextBlur('whisperCppModelPath', e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="e.g. C:\whisper.cpp\models\ggml-base.bin"
                      style={{ flex: 1 }}
                    />
                    <button 
                      onClick={handleBrowseWhisperCppModel}
                      className="neon-button secondary"
                      style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', height: '36px', minWidth: '95px' }}
                    >
                      <FolderOpen size={14} /> Browse
                    </button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}

        {runtime === 'custom_cmd' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#34c759' }}>CUSTOM NATIVE COMMAND RUNNER</span>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Command Execution Template</label>
              <input 
                type="text" 
                className="input-field" 
                value={customCmdTemplate} 
                onChange={(e) => setCustomCmdTemplate(e.target.value)}
                onBlur={(e) => handleTextBlur('customCmdTemplate', e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="whisper-ct2 {input_file} --model {model_path} --language {lang}"
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                Use variables: <code style={{ color: '#fff' }}>{'{input_file}'}</code> (wav recording), <code style={{ color: '#fff' }}>{'{model_path}'}</code>, <code style={{ color: '#fff' }}>{'{lang}'}</code> (2-letter language code).
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600 }}>Model Path (Folder / File)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="input-field" 
                  value={customCmdModelPath} 
                  onChange={(e) => setCustomCmdModelPath(e.target.value)}
                  onBlur={(e) => handleTextBlur('customCmdModelPath', e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. C:\models\whisper-base-ct2"
                  style={{ flex: 1 }}
                />
                <button 
                  onClick={handleBrowseCustomCmdModel}
                  className="neon-button secondary"
                  style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', height: '36px', minWidth: '95px' }}
                >
                  <FolderOpen size={14} /> Browse
                </button>
              </div>
            </div>

            <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
              💡 <strong>Инструкция:</strong><br />
              1. Установите faster-whisper: <code>pip install faster-whisper</code> (или <code>pip install whisper-ctranslate2</code>).<br />
              2. Задайте шаблон запуска с переменными <code>{'{input_file}'}</code>, <code>{'{model_path}'}</code>, <code>{'{lang}'}</code>.<br />
              3. Скачайте модель и укажите путь к ней выше.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
