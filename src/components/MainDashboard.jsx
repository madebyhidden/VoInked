import React, { useState, useEffect, useRef } from 'react';
import { Mic, Copy, Check, Cpu, Edit2, Trash2 } from 'lucide-react';
import { AudioRecorder, encodeWAV } from '../utils/audioHelper';
import { whisperManager } from '../utils/whisperModel';

export default function MainDashboard({ config, dictionary, modes, history, onUpdateHistory }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedModeId, setSelectedModeId] = useState(modes[0]?.id || 'raw');
  const [waveform, setWaveform] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState('');

  const [modelStatus, setModelStatus] = useState('idle');
  const [modelMessage, setModelMessage] = useState('');

  const recorderRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const canvasRef = useRef(null);

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
  }, [selectedModeId, config, dictionary, transcription]);

  // Draw Audio Waveform on Canvas in Clean Gray/Blue style
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (waveform.length === 0) {
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.strokeStyle = 'var(--accent-blue)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const barWidth = width / waveform.length;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i] / 128.0;
      const y = (v * height) / 2;
      const x = i * barWidth;
      const heightOffset = height / 2;
      if (i === 0) {
        ctx.moveTo(x, heightOffset - y / 2);
      } else {
        ctx.lineTo(x, heightOffset - y / 2);
      }
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = 'var(--text-muted)';
    ctx.lineWidth = 1;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i] / 128.0;
      const y = (v * height) / 2;
      const x = i * barWidth;
      const heightOffset = height / 2;
      if (i === 0) {
        ctx.moveTo(x, heightOffset + y / 3);
      } else {
        ctx.lineTo(x, heightOffset + y / 3);
      }
    }
    ctx.stroke();
  }, [waveform]);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = async () => {
    if (isRecording) return;
    setIsRecording(true);
    setTranscription('Recording audio...');
    
    if (window.electronAPI) {
      window.electronAPI.updateRecordingState(true);
    }

    recorderRef.current = new AudioRecorder();

    try {
      await recorderRef.current.start((waveData) => {
        setWaveform(waveData);
        // Pipe waveform updates directly to our transparent overlay pill!
        if (window.electronAPI) {
          window.electronAPI.sendWaveformToOverlay(waveData.slice(0, 32));
        }
      });

      if (config.engine === 'webspeech') {
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
    recognition.lang = config.language || 'ru-RU';
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
      
      const display = interimTranscript || transcription;
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
    if (!isRecording) return;
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

      if (config.engine === 'whisper') {
        const runtime = config.runtime || 'web';
        
        if (runtime === 'web') {
          setTranscription('Transcribing offline using Whisper AI (Web)...');
          const langCode = config.language ? config.language.split('-')[0] : 'ru';
          
          const res = await whisperManager.transcribe(audioBlob, { 
            language: langCode,
            modelName: config.whisperModel || 'Xenova/whisper-tiny'
          });
          finalRawText = res.text;
        } else {
          setTranscription('Encoding audio and running native Whisper...');
          const wavBuffer = encodeWAV(audioBlob, 16000);
          const wavPath = await window.electronAPI.saveTempWav(wavBuffer);

          if (runtime === 'whisper_cpp') {
            setTranscription('Transcribing natively using whisper.cpp...');
            finalRawText = await window.electronAPI.transcribeWhisperCpp({
              binaryPath: config.whisperCppBinaryPath,
              modelPath: config.whisperCppModelPath,
              wavPath,
              language: config.language || 'ru-RU'
            });
          } else if (runtime === 'custom_cmd') {
            setTranscription('Transcribing using custom python command...');
            finalRawText = await window.electronAPI.transcribeCustomCmd({
              commandTemplate: config.customCmdTemplate,
              wavPath,
              modelPath: config.customCmdModelPath,
              language: config.language || 'ru-RU'
            });
          }
        }
      } else {
        await new Promise(r => setTimeout(r, 600));
        finalRawText = transcription.replace('Recording audio...', '').trim() || 'No audio detected.';
      }

      const cleanedText = applyDictionary(finalRawText);
      setTranscription(cleanedText);

      let formattedText = cleanedText;
      const currentMode = modes.find(m => m.id === selectedModeId);

      if (config.geminiKey && currentMode && selectedModeId !== 'raw') {
        setTranscription('Formatting text with Gemini AI...');
        formattedText = await formatTextWithGemini(cleanedText, currentMode.prompt);
        setTranscription(formattedText);
      }

      const historyItem = {
        timestamp: new Date().toLocaleTimeString(),
        original: cleanedText,
        formatted: formattedText,
        mode: currentMode?.name || 'Raw'
      };
      onUpdateHistory([historyItem, ...history]);

      if (window.electronAPI) {
        window.electronAPI.writeClipboard(formattedText);
        window.electronAPI.sendTranscriptionToOverlay('Copied to clipboard!');
        // Auto paste simulated native keypress
        window.electronAPI.pasteTranscription(config.pasteMethod || 'ctrl_v');
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
    Object.entries(dictionary).forEach(([key, val]) => {
      const regex = new RegExp(`\\b${key}\\b`, 'gi');
      result = result.replace(regex, val);
    });
    return result;
  };

  const formatTextWithGemini = async (text, prompt) => {
    try {
      const response = await fetch(`https://generativelink.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiKey}`, {
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

  const handleCopy = (text, index) => {
    if (window.electronAPI) {
      window.electronAPI.writeClipboard(text);
    } else {
      navigator.clipboard.writeText(text);
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDeleteHistory = (indexToDelete) => {
    const updated = history.filter((_, idx) => idx !== indexToDelete);
    onUpdateHistory(updated);
  };

  const startEditingHistory = (idx, text) => {
    setEditingIndex(idx);
    setEditText(text);
  };

  const saveEditingHistory = (idx) => {
    const updated = history.map((item, i) => {
      if (i === idx) {
        return { ...item, formatted: editText };
      }
      return item;
    });
    onUpdateHistory(updated);
    setEditingIndex(null);
  };

  return (
    <div className="dashboard-container animate-slide-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', overflowY: 'auto' }}>
      
      {/* Top Section: Recorder Widget */}
      <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', position: 'relative', overflow: 'hidden' }}>
        
        {/* Active Target Indicator */}
        <div style={{ position: 'absolute', top: '12px', left: '16px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e' }}></div>
          Active target: <strong style={{ color: 'var(--accent-blue)' }}>Cursor Paste</strong>
        </div>

        {/* Selected Mode Indicator */}
        <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end', zIndex: 10 }}>
          {modes.slice(0, 4).map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedModeId(m.id)}
              className="glass"
              style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                color: selectedModeId === m.id ? '#fff' : 'var(--text-secondary)',
                border: selectedModeId === m.id ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                backgroundColor: selectedModeId === m.id ? 'rgba(0, 122, 255, 0.15)' : 'transparent',
                transition: 'var(--transition-smooth)'
              }}
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* Visualizer Waveform Canvas */}
        <canvas 
          ref={canvasRef} 
          width={450} 
          height={50} 
          style={{ width: '100%', maxHeight: '50px', borderRadius: '6px' }} 
        />

        {/* Clean macOS Record Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <button 
            onClick={toggleRecording}
            className="glass"
            style={{ 
              width: '72px', 
              height: '72px', 
              borderRadius: '50%', 
              border: isRecording ? '1px solid #ff453a' : '1px solid var(--border-glass)', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isRecording ? 'rgba(255, 69, 58, 0.08)' : 'rgba(255,255,255,0.03)',
              transform: isRecording ? 'scale(1.02)' : 'scale(1)',
              transition: 'var(--transition-smooth)'
            }}
            disabled={config.engine === 'whisper' && modelStatus !== 'ready'}
          >
            <Mic 
              size={30} 
              style={{ 
                color: isRecording ? '#ff453a' : 'var(--accent-blue)', 
                opacity: (config.engine === 'whisper' && modelStatus !== 'ready') ? 0.3 : 1,
                animation: isRecording ? 'pulse-ring 1.5s infinite' : 'none' 
              }} 
            />
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {isRecording ? 'Click to stop' : 'Hold Ctrl+Win or press Ctrl+Alt+R'}
          </span>
        </div>

        {/* Model Status bar (For Local Whisper) */}
        {config.engine === 'whisper' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-glass)', width: '100%', paddingTop: '10px', justifyContent: 'center' }}>
            <Cpu size={12} style={{ color: modelStatus === 'ready' ? '#34c759' : 'var(--accent-blue)' }} />
            <span>Whisper:</span>
            <strong style={{ color: modelStatus === 'ready' ? '#34c759' : 'var(--text-primary)' }}>
              {config.whisperModel} ({modelStatus.toUpperCase()})
            </strong>
            {modelMessage && <span style={{ opacity: 0.7 }}> - {modelMessage}</span>}
          </div>
        )}
      </div>

      {/* Transcription Results Card */}
      {transcription && (
        <div className="glass-panel animate-slide-in" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Latest Transcription
            </span>
            <button 
              onClick={() => handleCopy(transcription, 'latest')}
              className="glass"
              style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', border: '1px solid var(--border-glass)', background: 'transparent', color: 'var(--text-secondary)' }}
            >
              {copiedIndex === 'latest' ? <Check size={12} style={{ color: '#34c759' }} /> : <Copy size={12} />}
              {copiedIndex === 'latest' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div 
            style={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.15)', 
              padding: '12px', 
              borderRadius: '6px', 
              fontSize: '13px', 
              lineHeight: 1.5, 
              color: 'var(--text-primary)',
              minHeight: '30px',
              border: '1px solid rgba(255, 255, 255, 0.02)'
            }}
          >
            {transcription}
          </div>
        </div>
      )}

      {/* Transcription History */}
      <div className="glass-panel" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '180px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Transcription History</h3>
        
        {history.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '30px 0' }}>
            No transcriptions yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
            {history.map((item, idx) => (
              <div 
                key={idx} 
                className="glass" 
                style={{ 
                  padding: '12px', 
                  borderRadius: '8px', 
                  border: '1px solid var(--border-glass)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{item.timestamp}</span>
                    <span 
                      style={{ 
                        fontSize: '9px', 
                        padding: '1px 5px', 
                        borderRadius: '3px', 
                        background: 'rgba(0, 122, 255, 0.1)', 
                        color: 'var(--accent-blue)',
                        fontWeight: 600
                      }}
                    >
                      {item.mode}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                    <button 
                      onClick={() => handleCopy(item.formatted, idx)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      {copiedIndex === idx ? <Check size={12} style={{ color: '#34c759' }} /> : <Copy size={12} />}
                    </button>
                    <button 
                      onClick={() => startEditingHistory(idx, item.formatted)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <Edit2 size={12} />
                    </button>
                    <button 
                      onClick={() => handleDeleteHistory(idx)}
                      style={{ background: 'transparent', border: 'none', color: '#ff453a', cursor: 'pointer' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {editingIndex === idx ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <textarea 
                      className="input-field" 
                      value={editText} 
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      style={{ width: '100%', fontSize: '13px' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end' }}>
                      <button className="neon-button secondary" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => setEditingIndex(null)}>Cancel</button>
                      <button className="neon-button" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => saveEditingHistory(idx)}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', lineHeight: 1.4, color: 'var(--text-primary)' }}>
                    {item.formatted}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
