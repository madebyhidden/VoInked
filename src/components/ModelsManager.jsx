import React, { useState, useEffect } from 'react';
import { Database, Search, Download, Check, AlertTriangle, RefreshCw, Layers, Info } from 'lucide-react';
import { whisperManager } from '../utils/whisperModel';

const RECOMMENDATIONS = [
  { id: 'Xenova/whisper-tiny', name: 'Whisper Tiny (Multilingual)', size: '75 MB', desc: 'Fastest transcription speed. Perfect for quick notes. Supports Russian and English.' },
  { id: 'Xenova/whisper-base', name: 'Whisper Base (Multilingual)', size: '145 MB', desc: 'Balanced accuracy and speed. Good middleground for standard transcriptions.' },
  { id: 'Xenova/whisper-small', name: 'Whisper Small (Multilingual)', size: '460 MB', desc: 'High accuracy, slower. Recommended for complex terminology.' }
];

export default function ModelsManager({ config, onSaveConfig }) {
  const [searchQuery, setSearchQuery] = useState('whisper');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [installedModels, setInstalledModels] = useState(() => {
    const saved = localStorage.getItem('voiceink_installed_models');
    return saved ? JSON.parse(saved) : ['Xenova/whisper-tiny'];
  });

  const [activeModel, setActiveModel] = useState(config.whisperModel || 'Xenova/whisper-tiny');

  // Download states
  const [downloadingModelId, setDownloadingModelId] = useState(null);
  const [loaderStatus, setLoaderStatus] = useState('');
  const [fileProgresses, setFileProgresses] = useState({});

  useEffect(() => {
    localStorage.setItem('voiceink_installed_models', JSON.stringify(installedModels));
  }, [installedModels]);

  useEffect(() => {
    handleSearch(null);
  }, []);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    const mirrorBase = config.hfMirror || 'https://hf-mirror.com';
    try {
      const res = await fetch(
        `${mirrorBase}/api/models?search=${encodeURIComponent(searchQuery)}&limit=30&sort=downloads&full=true`
      );
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownload = async (modelId, isNotASR, isNotOnnx, isGgml) => {
    if (downloadingModelId) {
      alert('Another model download is already in progress.');
      return;
    }

    if (config.runtime === 'whisper_cpp') {
      setDownloadingModelId(modelId);
      setLoaderStatus('Запуск автоматической установки модели GGML...');
      setFileProgresses({});

      const unsubscribeProgress = window.electronAPI.onNativeDownloadProgress((data) => {
        setLoaderStatus(data.message);
        setFileProgresses(prev => ({
          ...prev,
          [modelId]: data.progress
        }));
      });

      try {
        const result = await window.electronAPI.setupNativeWhisper({
          modelName: modelId,
          hfMirror: config.hfMirror || 'https://hf-mirror.com',
          backend: config.whisperCppBackend || 'cuda12'
        });
        
        onSaveConfig({
          ...config,
          whisperCppBinaryPath: result.binaryPath,
          whisperCppModelPath: result.modelPath,
          whisperModel: modelId
        });
        
        setInstalledModels(prev => [...new Set([...prev, modelId])]);
        setActiveModel(modelId);
        alert(`Модель ${modelId} успешно установлена и активирована для whisper.cpp!`);
      } catch (err) {
        alert(`Ошибка установки: ${err.message || err}`);
      } finally {
        unsubscribeProgress();
        setDownloadingModelId(null);
        setFileProgresses({});
      }
      return;
    }

    if (isGgml) {
      alert(
        `Внимание!\n\nМодель "${modelId}" находится в формате GGML (.bin). Наше мультиплатформенное приложение использует движок ONNX (Transformers.js).\n\nПожалуйста, используйте ONNX-версию модели:\n👉 onnx-community/whisper-large-v3-turbo`
      );
      return;
    }

    if (isNotASR || isNotOnnx) {
      const parts = [];
      if (isNotASR) parts.push('не помечена как ASR (распознавание речи)');
      if (isNotOnnx) parts.push('не имеет ONNX-весов');
      
      const confirmMsg = `Внимание! Эта модель ${parts.join(' и ')}. Скорее всего, она не запустится.\n\nРекомендуется скачать ONNX-совместимую версию, например: "onnx-community/whisper-large-v3-turbo".\n\nВы уверены, что хотите продолжить скачивание?`;
      if (!window.confirm(confirmMsg)) return;
    }

    setDownloadingModelId(modelId);
    setLoaderStatus('Starting download...');
    setFileProgresses({});

    const device = config.device || 'webgpu';
    const hfMirror = config.hfMirror || 'https://hf-mirror.com';

    whisperManager.init(
      modelId,
      device,
      hfMirror,
      (status, msg) => {
        setLoaderStatus(msg);
        
        if (status === 'ready') {
          setInstalledModels(prev => [...new Set([...prev, modelId])]);
          setActiveModel(modelId);
          onSaveConfig({ ...config, whisperModel: modelId });
          setDownloadingModelId(null);
          setFileProgresses({});
          alert(`Model ${modelId} successfully installed and activated!`);
        } else if (status === 'error') {
          setDownloadingModelId(null);
          const userFriendlyError = msg.includes('split') 
            ? 'Сбой инициализации: Модель несовместима с ONNX Runtime. Пожалуйста, убедитесь, что вы выбрали ONNX-версию модели.'
            : msg;
          alert(`Error: ${userFriendlyError}`);
        }
      },
      (progressEvent) => {
        setFileProgresses(prev => ({
          ...prev,
          [progressEvent.file]: progressEvent.progress
        }));
      }
    );
  };

  const handleActivate = async (modelId) => {
    setActiveModel(modelId);
    
    if (config.runtime === 'whisper_cpp') {
      const userData = await window.electronAPI.getUserDataPath();
      let modelFile = 'ggml-base.bin';
      const lowerName = modelId.toLowerCase();
      if (lowerName.includes('large-v3-turbo-q5_0') || lowerName.includes('large-v3-turbo-q5') || lowerName.includes('q5_0')) modelFile = 'ggml-large-v3-turbo-q5_0.bin';
      else if (lowerName.includes('large-v3-turbo')) modelFile = 'ggml-large-v3-turbo.bin';
      else if (lowerName.includes('large-v3')) modelFile = 'ggml-large-v3.bin';
      else if (lowerName.includes('large')) modelFile = 'ggml-large-v3-turbo-q5_0.bin';
      else if (lowerName.includes('tiny')) modelFile = 'ggml-tiny.bin';
      else if (lowerName.includes('base')) modelFile = 'ggml-base.bin';
      else if (lowerName.includes('small')) modelFile = 'ggml-small.bin';
      else if (lowerName.includes('medium')) modelFile = 'ggml-medium.bin';

      const modelPath = `${userData}/models/${modelFile}`.replace(/\\/g, '/');

      onSaveConfig({ 
        ...config, 
        whisperModel: modelId,
        whisperCppModelPath: modelPath
      });
      alert(`Активная модель whisper.cpp переключена на: ${modelFile}`);
    } else {
      onSaveConfig({ ...config, whisperModel: modelId });
      
      const device = config.device || 'webgpu';
      const hfMirror = config.hfMirror || 'https://hf-mirror.com';
      whisperManager.init(modelId, device, hfMirror, (status, msg) => {
        console.log(`[Model Switch] ${status}: ${msg}`);
      });
      
      alert(`Active model switched to: ${modelId}`);
    }
  };

  const getAverageProgress = () => {
    const files = Object.values(fileProgresses);
    if (files.length === 0) return 0;
    const sum = files.reduce((acc, p) => acc + p, 0);
    return Math.round(sum / files.length);
  };

  return (
    <div className="models-container animate-slide-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Database size={24} style={{ color: 'var(--accent-blue)' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Hugging Face Models Manager</h2>
      </div>

      {/* Dynamic format notice info card */}
      <div className="glass" style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(0, 122, 255, 0.2)', background: 'rgba(0, 122, 255, 0.03)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <Info size={16} style={{ color: 'var(--accent-blue)', marginTop: '2px', flexShrink: 0 }} />
        <div style={{ fontSize: '12px', lineHeight: 1.4, color: 'var(--text-secondary)' }}>
          <strong style={{ color: '#fff' }}>Важно о форматах:</strong> Оригинальный voiceink (для macOS) использует GGML (.bin) модели. Данный мультиплатформенный клон использует движок ONNX (через Transformers.js). Для работы с Large v3 Turbo, пожалуйста, загружайте <strong style={{ color: 'var(--accent-blue)' }}>onnx-community/whisper-large-v3-turbo</strong> вместо GGML-файлов.
        </div>
      </div>

      {/* Downloading progress dashboard */}
      {downloadingModelId && (
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-blue)' }}>Downloading</div>
              <strong style={{ fontSize: '14px' }}>{downloadingModelId}</strong>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-blue)' }}>{getAverageProgress()}%</div>
          </div>

          <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${getAverageProgress()}%`, background: 'var(--accent-blue)', transition: 'width 0.1s ease' }}></div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {loaderStatus}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '6px' }}>
            {Object.entries(fileProgresses).map(([fileName, pct]) => (
              <div key={fileName} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{fileName}</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ height: '2px', background: 'rgba(255,255,255,0.03)', borderRadius: '1px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: 'rgba(255,255,255,0.4)' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Installed models list */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} /> Installed Models
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {installedModels.map(modelId => {
            const isActive = activeModel === modelId;
            return (
              <div 
                key={modelId} 
                className="glass" 
                style={{ 
                  padding: '12px 16px', 
                  borderRadius: '8px', 
                  border: isActive ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  background: isActive ? 'rgba(0, 122, 255, 0.04)' : 'transparent'
                }}
              >
                <div>
                  <h4 style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{modelId}</h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {isActive ? 'Loaded & Active' : 'Cached Offline'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {isActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--accent-blue)', fontWeight: 600 }}>
                      <Check size={14} /> Active
                    </div>
                  ) : (
                    <button 
                      className="neon-button secondary" 
                      onClick={() => handleActivate(modelId)}
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Search & Recommendations */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Hugging Face Model Explorer</h3>
        
        {/* Search Input Box */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search Hugging Face models..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, background: 'rgba(0,0,0,0.2)' }}
          />
          <button type="submit" className="neon-button" style={{ width: '100px' }} disabled={isSearching}>
            {isSearching ? <RefreshCw className="animate-spin" size={14} /> : <Search size={14} />}
            {isSearching ? '...' : 'Search'}
          </button>
        </form>

        {/* Recommended Models */}
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.05em' }}>RECOMMENDED ON-DEVICE WHISPER MODELS (ONNX)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
            {RECOMMENDATIONS.map(rec => {
              const isDownloaded = installedModels.includes(rec.id);
              const isActive = activeModel === rec.id;
              
              return (
                <div 
                  key={rec.id} 
                  className="glass" 
                  style={{ 
                    padding: '12px 14px', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-glass)',
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'space-between',
                    gap: '10px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <strong style={{ fontSize: '13px', color: '#fff' }}>{rec.name}</strong>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{rec.size}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.3 }}>{rec.desc}</p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{rec.id}</span>
                    {isDownloaded ? (
                      isActive ? (
                        <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: 600 }}>Active</span>
                      ) : (
                        <button className="neon-button secondary" onClick={() => handleActivate(rec.id)} style={{ padding: '4px 8px', fontSize: '11px' }}>
                          Activate
                        </button>
                      )
                    ) : (
                      <button className="neon-button" onClick={() => handleDownload(rec.id, false, false, false)} style={{ padding: '4px 8px', fontSize: '11px' }}>
                        Download
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Search Results list with Warnings tags */}
        {searchResults.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.05em' }}>HF SEARCH RESULTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {searchResults.map(model => {
                const isDownloaded = installedModels.includes(model.id);
                const isActive = activeModel === model.id;

                const modelIdLower = model.id.toLowerCase();
                const isWhisperName = modelIdLower.includes('whisper');
                
                // Smart ASR validation: check pipeline tag OR if name has 'whisper' in it
                const isNotASR = model.pipeline_tag !== 'automatic-speech-recognition' && !isWhisperName;
                
                // GGML check
                const isGgml = modelIdLower.includes('ggml') || modelIdLower.includes('gguf') || modelIdLower.includes('.bin');
                
                // ONNX check
                const hasOnnx = model.tags && (
                  model.tags.includes('onnx') || 
                  model.tags.includes('transformers.js') || 
                  modelIdLower.includes('onnx') ||
                  modelIdLower.includes('transformers.js')
                );
                const isNotOnnx = !hasOnnx && !isGgml;
                
                return (
                  <div 
                    key={model.id} 
                    className="glass" 
                    style={{ 
                      padding: '10px 14px', 
                      borderRadius: '8px', 
                      border: '1px solid var(--border-glass)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1, marginRight: '12px' }}>
                      <strong style={{ fontSize: '12px', color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{model.id}</strong>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Downloads: {model.downloads.toLocaleString()}</span>
                        
                        {/* Dynamic warning badges */}
                        {isGgml && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <AlertTriangle size={8} /> GGML Формат (Не совместим)
                          </span>
                        )}
                        {isNotASR && !isGgml && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255, 149, 0, 0.12)', color: '#ff9500', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <AlertTriangle size={8} /> Не Speech-to-Text
                          </span>
                        )}
                        {isNotOnnx && !isGgml && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255, 149, 0, 0.12)', color: '#ff9500', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <AlertTriangle size={8} /> Нет ONNX-весов
                          </span>
                        )}
                        {!isNotASR && !isNotOnnx && !isGgml && (
                          <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', fontWeight: 600 }}>
                            Совместимо (ONNX)
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {isDownloaded ? (
                        isActive ? (
                          <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: 600 }}>Active</span>
                        ) : (
                          <button className="neon-button secondary" onClick={() => handleActivate(model.id)} style={{ padding: '4px 8px', fontSize: '11px' }}>
                            Activate
                          </button>
                        )
                      ) : (
                        <button 
                          className="neon-button" 
                          onClick={() => handleDownload(model.id, isNotASR, isNotOnnx, isGgml)} 
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
