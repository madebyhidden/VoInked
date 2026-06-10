import React, { useState, useEffect } from 'react';
import { Cpu, Zap, Download, Check, Loader2, Sparkles, Terminal, FileCode, FolderOpen } from 'lucide-react';
import { whisperManager } from '../utils/whisperModel';

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(1);
  const [gpuStatus, setGpuStatus] = useState({ supported: false, name: 'Checking...' });
  
  // Runtime configuration states
  const [selectedRuntime, setSelectedRuntime] = useState('whisper_cpp'); // Default to native C++ executable
  const [selectedDevice, setSelectedDevice] = useState('webgpu');
  const [selectedModel, setSelectedModel] = useState('Xenova/whisper-tiny');
  const [selectedMirror, setSelectedMirror] = useState('https://hf-mirror.com');
  const [selectedBackend, setSelectedBackend] = useState('cuda12');
  
  // Native paths
  const [whisperCppBinary, setWhisperCppBinary] = useState('');
  const [whisperCppModel, setWhisperCppModel] = useState('');
  const [customCmdTemplate, setCustomCmdTemplate] = useState('whisper-ct2 {input_file} --model {model_path} --language {lang}');
  const [customCmdModel, setCustomCmdModel] = useState('');

  // Download states for Web runtime
  const [downloadStatus, setDownloadStatus] = useState('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadMsg, setDownloadMsg] = useState('');

  // Native automatic installation states
  const [nativeInstallStatus, setNativeInstallStatus] = useState('idle');
  const [nativeInstallProgress, setNativeInstallProgress] = useState(0);
  const [nativeInstallMsg, setNativeInstallMsg] = useState('');

  const [osRec, setOsRec] = useState({ os: 'Unknown', advice: '' });

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
        hfMirror: selectedMirror,
        backend: selectedBackend
      });
      
      setNativeInstallStatus('completed');
      setNativeInstallMsg('Установка завершена успешно!');
      setNativeInstallProgress(100);

      // Populate paths automatically
      setWhisperCppBinary(result.binaryPath);
      setWhisperCppModel(result.modelPath);
    } catch (err) {
      console.error(err);
      setNativeInstallStatus('error');
      setNativeInstallMsg(`Ошибка установки: ${err.message || err}`);
    } finally {
      unsubscribeProgress();
    }
  };

  // Native path selector helper handlers using Electron dialog APIs
  const handleBrowseWhisperCppBinary = async () => {
    try {
      const path = await window.electronAPI.selectFile({
        title: 'Select whisper.cpp Main Binary (main.exe / main)',
        filters: [{ name: 'Executables', extensions: ['exe', 'bin', 'sh', '*'] }]
      });
      if (path) setWhisperCppBinary(path);
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
      if (path) setWhisperCppModel(path);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBrowseCustomCmdModel = async () => {
    try {
      // For python/faster-whisper CLI, models are usually directories. Let's try selectFolder first, then selectFile.
      const path = await window.electronAPI.selectFolder({
        title: 'Select Custom CLI Model Folder'
      });
      if (path) {
        setCustomCmdModel(path);
      } else {
        const filePath = await window.electronAPI.selectFile({
          title: 'Select Custom CLI Model File'
        });
        if (filePath) setCustomCmdModel(filePath);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Detect GPU and query OS recommendations
  useEffect(() => {
    async function checkGPU() {
      let isSupported = false;
      let name = 'Not detected';

      if (navigator.gpu) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) {
            isSupported = true;
            const info = adapter.info || (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : null);
            if (info) {
              name = info.device || info.description || info.vendor || 'Generic WebGPU GPU';
            } else {
              name = 'Generic WebGPU Device';
            }
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
              name = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Generic GPU';
            }
          }
        } catch (e) {}
      }

      setGpuStatus({ supported: isSupported, name });
      setSelectedDevice(isSupported ? 'webgpu' : 'wasm');

      // OS Recommendation
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (userAgent.includes('mac')) {
        setOsRec({
          os: 'macOS',
          advice: 'Рекомендуется: whisper.cpp (поддержка Apple Silicon GPU через Metal). Это дает максимальную скорость и полную автономность.'
        });
        setSelectedRuntime('whisper_cpp');
      } else if (userAgent.includes('win')) {
        const hasNvidia = name.toLowerCase().includes('nvidia');
        setOsRec({
          os: 'Windows',
          advice: hasNvidia 
            ? `Рекомендуется: whisper.cpp c GPU ускорением (CUDA 12) на видеокарте ${name}. Скорость транскрибации составит ~0.4 сек.`
            : 'Рекомендуется: whisper.cpp (Native C++) с CPU ускорением OpenBLAS.'
        });
        setSelectedBackend(hasNvidia ? 'cuda12' : 'blas');
        setSelectedRuntime('whisper_cpp');
      } else {
        setOsRec({
          os: 'Linux',
          advice: 'Рекомендуется: whisper.cpp (Native C++) или Custom Python CLI.'
        });
        setSelectedRuntime('whisper_cpp');
      }
    }

    checkGPU();
  }, []);

  const handleStartDownload = () => {
    setDownloadStatus('loading');
    setDownloadProgress(0);
    setDownloadMsg('Initializing download pipeline...');

    whisperManager.init(
      selectedModel,
      selectedDevice,
      selectedMirror,
      (status, msg) => {
        if (status === 'ready') {
          setDownloadStatus('ready');
          setDownloadMsg(`Initialization complete! Model loaded successfully on ${whisperManager.currentDevice.toUpperCase()}.`);
          setDownloadProgress(100);
        } else if (status === 'error') {
          setDownloadStatus('error');
          setDownloadMsg(`Failed to initialize: ${msg}`);
        } else {
          setDownloadMsg(msg);
        }
      },
      (progressData) => {
        setDownloadProgress(progressData.progress);
        setDownloadMsg(`Downloading model weight files: ${progressData.progress}%`);
      }
    );
  };

  const handleNextStep = () => {
    if (step === 2 && selectedRuntime !== 'web') {
      // Bypasses model downloads step if using native runtimes
      handleFinishNative();
    } else {
      setStep(step + 1);
    }
  };

  const handleFinishNative = () => {
    onComplete({
      engine: 'whisper',
      runtime: selectedRuntime,
      whisperCppBackend: selectedBackend,
      whisperCppBinaryPath: whisperCppBinary,
      whisperCppModelPath: whisperCppModel,
      customCmdTemplate: customCmdTemplate,
      customCmdModelPath: customCmdModel,
      whisperModel: selectedModel,
      hfMirror: selectedMirror,
      language: 'ru-RU',
      shortcut: 'Ctrl+Alt+R',
      pasteMethod: 'ctrl_v',
      geminiKey: '',
      isInitialized: true
    });
  };

  const handleFinishWeb = () => {
    onComplete({
      engine: 'whisper',
      runtime: 'web',
      device: whisperManager.currentDevice || selectedDevice,
      whisperModel: selectedModel,
      hfMirror: selectedMirror,
      language: 'ru-RU',
      shortcut: 'Ctrl+Alt+R',
      pasteMethod: 'ctrl_v',
      geminiKey: '',
      isInitialized: true
    });
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'radial-gradient(circle at center, #1f1f23 0%, #111112 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '20px'
    }}>
      <div 
        className="glass-panel" 
        style={{
          width: '560px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          background: 'rgba(28, 28, 30, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          borderRadius: '16px'
        }}
      >
        {/* Logo/Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', 
            background: 'var(--accent-blue)', display: 'flex', 
            alignItems: 'center', justifyContent: 'center'
          }}>
            <Sparkles size={16} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-primary)' }}>VOICEINK SETUP</span>
        </div>

        {/* Step Indicator */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[1, 2, 3].map((s) => {
            // Hide step 3 bar if native is selected
            if (s === 3 && selectedRuntime !== 'web') return null;
            return (
              <div 
                key={s}
                style={{
                  flex: 1, height: '4px', borderRadius: '2px',
                  background: s <= step ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.08)',
                  transition: 'var(--transition-smooth)'
                }}
              />
            );
          })}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="animate-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Welcome to VoiceInk!</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              VoiceInk is a privacy-first dictation tool that transcribes your voice to text offline.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You can run dictation directly in the app's browser context (Web) or configure a fully native execution backend for maximum hardware efficiency.
            </p>

            <div className="glass" style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(0, 122, 255, 0.15)', background: 'rgba(0,122,255,0.02)' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase' }}>OS Recommendation ({osRec.os})</span>
              <p style={{ fontSize: '12px', color: '#fff', marginTop: '4px', lineHeight: 1.4 }}>{osRec.advice}</p>
            </div>

            <button 
              className="neon-button" 
              style={{ marginTop: '8px', width: '100%', padding: '12px' }}
              onClick={() => setStep(2)}
            >
              Choose Runtime Engine
            </button>
          </div>
        )}

        {/* Step 2: Runtime Selection */}
        {step === 2 && (
          <div className="animate-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Whisper Runtime Engine</h2>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Select the runtime engine for local neural network execution.
              </p>
            </div>

            {/* Runtime Options Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Option 1: whisper.cpp (Native C++) - Recommended for macOS / CPU fallbacks */}
              <div 
                className="glass"
                onClick={() => setSelectedRuntime('whisper_cpp')}
                style={{
                  padding: '14px', borderRadius: '10px', cursor: 'pointer',
                  border: selectedRuntime === 'whisper_cpp' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                  backgroundColor: selectedRuntime === 'whisper_cpp' ? 'rgba(0, 122, 255, 0.05)' : 'transparent',
                  transition: 'var(--transition-smooth)',
                  boxShadow: selectedRuntime === 'whisper_cpp' ? '0 4px 20px rgba(0, 122, 255, 0.15)' : 'none'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
                  <Cpu size={15} style={{ color: '#ffb703' }} /> 
                  <span>whisper.cpp (Native Binary)</span>
                  {window.navigator.userAgent.toLowerCase().includes('mac') ? (
                    <span style={{ fontSize: '9px', backgroundColor: '#34c759', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 700 }}>RECOMMENDED FOR MACOS</span>
                  ) : (
                    <span style={{ fontSize: '9px', backgroundColor: '#ffb703', color: '#000', padding: '2px 6px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 700 }}>RECOMMENDED FOR WINDOWS / CPU</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                  Lightweight, fast C++ execution. Perfect for Apple Silicon (Metal GPU) or standard Windows setups without Python.
                </div>
              </div>

              {/* Option 2: Custom Command Line (Python/faster-whisper) - Recommended for NVIDIA CUDA */}
              <div 
                className="glass"
                onClick={() => setSelectedRuntime('custom_cmd')}
                style={{
                  padding: '14px', borderRadius: '10px', cursor: 'pointer',
                  border: selectedRuntime === 'custom_cmd' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                  backgroundColor: selectedRuntime === 'custom_cmd' ? 'rgba(0, 122, 255, 0.05)' : 'transparent',
                  transition: 'var(--transition-smooth)',
                  boxShadow: selectedRuntime === 'custom_cmd' ? '0 4px 20px rgba(0, 122, 255, 0.15)' : 'none'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
                  <Terminal size={15} style={{ color: '#34c759' }} /> 
                  <span>Custom CLI (faster-whisper / Python)</span>
                  {window.navigator.userAgent.toLowerCase().includes('win') || window.navigator.userAgent.toLowerCase().includes('linux') ? (
                    <span style={{ fontSize: '9px', backgroundColor: '#007aff', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 700 }}>RECOMMENDED FOR NVIDIA CUDA</span>
                  ) : (
                    <span style={{ fontSize: '9px', backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#fff', padding: '2px 6px', borderRadius: '4px', marginLeft: 'auto', fontWeight: 500 }}>PYTHON CLI</span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                  Executes custom command line templates (e.g. running global python scripts on NVIDIA GPU CUDA).
                </div>
              </div>

              {/* Option 3: Web (Transformers.js) */}
              <div 
                className="glass"
                onClick={() => setSelectedRuntime('web')}
                style={{
                  padding: '14px', borderRadius: '10px', cursor: 'pointer',
                  border: selectedRuntime === 'web' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                  backgroundColor: selectedRuntime === 'web' ? 'rgba(0, 122, 255, 0.05)' : 'transparent',
                  transition: 'var(--transition-smooth)'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
                  <Sparkles size={15} style={{ color: 'var(--accent-blue)' }} /> 
                  <span>Web (Transformers.js v3)</span>
                  <span style={{ fontSize: '9px', backgroundColor: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', marginLeft: 'auto' }}>WEB FALLBACK (ZERO SETUP)</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                  Zero setup. Runs directly inside the app worker. Supports GPU (WebGPU) or CPU.
                </div>
              </div>

            </div>

            {/* Sub-configurations based on selection */}
            {selectedRuntime === 'web' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => gpuStatus.supported && setSelectedDevice('webgpu')}
                    className="glass"
                    style={{
                      flex: 1, padding: '10px', borderRadius: '6px', cursor: gpuStatus.supported ? 'pointer' : 'not-allowed',
                      border: selectedDevice === 'webgpu' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                      backgroundColor: selectedDevice === 'webgpu' ? 'rgba(0,122,255,0.04)' : 'transparent',
                      opacity: gpuStatus.supported ? 1 : 0.5,
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '12px', color: '#fff' }}>GPU (WebGPU)</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Uses WebGPU acceleration.</div>
                  </button>
                  <button
                    onClick={() => setSelectedDevice('wasm')}
                    className="glass"
                    style={{
                      flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer',
                      border: selectedDevice === 'wasm' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                      backgroundColor: selectedDevice === 'wasm' ? 'rgba(0,122,255,0.04)' : 'transparent',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '12px', color: '#fff' }}>CPU (WASM)</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Standard CPU fallback.</div>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Download Mirror</label>
                  <select 
                    className="input-field" 
                    value={selectedMirror}
                    onChange={(e) => setSelectedMirror(e.target.value)}
                  >
                    <option value="https://hf-mirror.com">HF Mirror (High-Speed Mirror - RU/CIS)</option>
                    <option value="https://huggingface.co">Hugging Face (Official - VPN required in RU)</option>
                  </select>
                </div>
              </div>
            )}

            {selectedRuntime === 'whisper_cpp' && (
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#ffb703' }}>WHISPER.CPP AUTOMATED SETUP</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Размер модели</label>
                  <select 
                    className="input-field"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Движок ускорения (Backend)</label>
                  <select 
                    className="input-field"
                    value={selectedBackend}
                    onChange={(e) => setSelectedBackend(e.target.value)}
                  >
                    <option value="cuda12">NVIDIA GPU (CUDA 12.4) - Для современных видеокарт (RTX 4070/30/20)</option>
                    <option value="cuda11">NVIDIA GPU (CUDA 11.8) - Для старых видеокарт GTX/RTX</option>
                    <option value="blas">CPU Accelerated (OpenBLAS) - Медленнее (для AMD/Intel/CPU)</option>
                    <option value="cpu">CPU Standard (AVX) - Базовый без оптимизаций</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Зеркало для загрузки</label>
                  <select 
                    className="input-field"
                    value={selectedMirror}
                    onChange={(e) => setSelectedMirror(e.target.value)}
                  >
                    <option value="https://hf-mirror.com">HF Mirror (Высокая скорость в РФ/СНГ)</option>
                    <option value="https://huggingface.co">Hugging Face (Официальный - требуется VPN)</option>
                  </select>
                </div>

                <button
                  className="neon-button"
                  style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  onClick={handleStartNativeSetup}
                  disabled={nativeInstallStatus === 'installing'}
                >
                  {nativeInstallStatus === 'installing' ? (
                    <>
                      <Loader2 className="animate-spin" size={14} />
                      Скачивание и установка... ({nativeInstallProgress}%)
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      Автоматическая 1-Click Установка
                    </>
                  )}
                </button>

                {nativeInstallStatus !== 'idle' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Статус:</span>
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

                <div style={{ display: 'flex', alignItems: 'center', margin: '8px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                  <span style={{ padding: '0 8px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Или укажите пути вручную</span>
                  <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Путь к бинарнику (main / main.exe)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      className="input-field"
                      style={{ flex: 1 }}
                      placeholder={window.navigator.userAgent.toLowerCase().includes('win') ? "e.g. C:\\whisper.cpp\\main.exe" : "/usr/local/bin/whisper-cpp"}
                      value={whisperCppBinary}
                      onChange={(e) => setWhisperCppBinary(e.target.value)}
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Путь к модели (ggml-model.bin)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      className="input-field"
                      style={{ flex: 1 }}
                      placeholder="e.g. C:\whisper.cpp\models\ggml-base.bin"
                      value={whisperCppModel}
                      onChange={(e) => setWhisperCppModel(e.target.value)}
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
            )}

            {selectedRuntime === 'custom_cmd' && (
              <div className="glass-panel" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#34c759' }}>CUSTOM COMMAND SETUP</span>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Command Template</label>
                  <input 
                    type="text" 
                    className="input-field"
                    placeholder="whisper-ct2 {input_file} --model {model_path} --language {lang}"
                    value={customCmdTemplate}
                    onChange={(e) => setCustomCmdTemplate(e.target.value)}
                  />
                  <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                    Variables: <code style={{ color: '#fff' }}>{'{input_file}'}</code> (path to wav), <code style={{ color: '#fff' }}>{'{model_path}'}</code>, <code style={{ color: '#fff' }}>{'{lang}'}</code>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Model Path (Folder / File)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      className="input-field"
                      style={{ flex: 1 }}
                      placeholder="e.g. C:\models\whisper-base-ct2"
                      value={customCmdModel}
                      onChange={(e) => setCustomCmdModel(e.target.value)}
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

                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                  💡 <strong>Как настроить Custom CLI:</strong><br />
                  1. Установите faster-whisper через Python: <code>pip install faster-whisper</code> (или <code>pip install whisper-ctranslate2</code>).<br />
                  2. Введите шаблон команды выполнения. Например, для whisper-ctranslate2: <code>whisper-ct2 {'{input_file}'} --model {'{model_path}'} --language {'{lang}'} --device cuda</code>.<br />
                  3. Скачайте модель c Hugging Face и укажите путь к ней выше.
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button className="neon-button secondary" style={{ flex: 1 }} onClick={() => setStep(1)}>
                Back
              </button>
              <button 
                className="neon-button" 
                style={{ flex: 2 }} 
                onClick={handleNextStep}
                disabled={selectedRuntime === 'whisper_cpp' && (!whisperCppBinary || !whisperCppModel)}
              >
                {selectedRuntime === 'web' ? 'Configure Models' : 'Finish Setup'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Web Download (only for Web runtime) */}
        {step === 3 && selectedRuntime === 'web' && (
          <div className="animate-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Download Dictation Model</h2>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Download the local Whisper model. Files are saved offline in Cache Storage.
              </p>
            </div>

            {downloadStatus === 'idle' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Choose Model Size</label>
                  <select 
                    className="input-field"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    <option value="Xenova/whisper-tiny">Tiny (Recommended, 75MB) - Fastest</option>
                    <option value="Xenova/whisper-base">Base (140MB) - Balanced</option>
                    <option value="onnx-community/whisper-large-v3-turbo">Large v3 Turbo (800MB) - High Accuracy</option>
                  </select>
                </div>
                
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Server: <strong style={{ color: 'var(--accent-blue)' }}>{selectedMirror}</strong>
                </div>

                <button 
                  className="neon-button" 
                  style={{ width: '100%', padding: '12px' }}
                  onClick={handleStartDownload}
                >
                  <Download size={16} /> Download & Verify Model
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                  <span style={{ color: downloadStatus === 'ready' ? '#34c759' : 'var(--accent-blue)' }}>
                    {downloadStatus === 'loading' ? 'Downloading...' : downloadStatus === 'ready' ? 'Ready!' : 'Error'}
                  </span>
                </div>

                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${downloadProgress}%`, 
                      height: '100%', 
                      background: downloadStatus === 'ready' ? '#34c759' : 'var(--accent-blue)',
                      transition: 'width 0.2s ease-out'
                    }}
                  />
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', minHeight: '32px' }}>
                  {downloadMsg}
                </div>

                {downloadStatus === 'ready' && (
                  <button 
                    className="neon-button" 
                    style={{ width: '100%', padding: '12px', backgroundColor: '#34c759' }}
                    onClick={handleFinishWeb}
                  >
                    <Check size={16} /> Finish Setup & Launch
                  </button>
                )}

                {downloadStatus === 'error' && (
                  <button 
                    className="neon-button" 
                    style={{ width: '100%', padding: '12px', backgroundColor: '#ff453a' }}
                    onClick={handleStartDownload}
                  >
                    Retry Download
                  </button>
                )}
              </div>
            )}

            {downloadStatus === 'idle' && (
              <button className="neon-button secondary" onClick={() => setStep(2)}>
                Back
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
