import React, { useEffect, useRef } from 'react';
import { Mic, Copy, Check, Cpu } from 'lucide-react';

export default function TranscribeAudio({
  config,
  modes,
  selectedModeId,
  setSelectedModeId,
  isRecording,
  isTranscribing,
  transcription,
  waveform,
  modelStatus,
  modelMessage,
  toggleRecording,
  handleCopy,
  copiedIndex
}) {
  const canvasRef = useRef(null);

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
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
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

  return (
    <div className="animate-slide-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Mic Recording Panel */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', position: 'relative', overflow: 'hidden' }}>
        
        {/* Active Target Indicator */}
        <div style={{ position: 'absolute', top: '16px', left: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#28c93f', boxShadow: '0 0 4px rgba(40,201,63,0.5)' }}></div>
          Active target: <strong style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>Cursor Paste</strong>
        </div>

        {/* Selected Mode Indicator */}
        <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end', zIndex: 10 }}>
          {modes.slice(0, 5).map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedModeId(m.id)}
              className="glass"
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                color: selectedModeId === m.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                border: selectedModeId === m.id ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                backgroundColor: selectedModeId === m.id ? 'var(--accent-blue-glow)' : 'transparent',
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
          width={500} 
          height={60} 
          style={{ width: '100%', maxHeight: '60px', borderRadius: '6px', marginTop: '10px' }} 
        />

        {/* Clean macOS Record Button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
          <button 
            onClick={toggleRecording}
            className="glass"
            style={{ 
              width: '84px', 
              height: '84px', 
              borderRadius: '50%', 
              border: isRecording ? '2px solid #ff3b30' : '1px solid var(--border-glass)', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isRecording ? 'rgba(255, 59, 48, 0.08)' : 'rgba(0,0,0,0.02)',
              boxShadow: isRecording ? '0 0 15px rgba(255,59,48,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
              transform: isRecording ? 'scale(1.05)' : 'scale(1)',
              transition: 'var(--transition-smooth)'
            }}
            disabled={config.engine === 'whisper' && modelStatus !== 'ready'}
          >
            <Mic 
              size={36} 
              style={{ 
                color: isRecording ? '#ff3b30' : 'var(--accent-blue)', 
                opacity: (config.engine === 'whisper' && modelStatus !== 'ready') ? 0.3 : 1,
                animation: isRecording ? 'pulse-ring 1.5s infinite' : 'none' 
              }} 
            />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {isRecording ? 'Recording...' : 'Ready to Transcribe'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {isRecording ? 'Click to stop and insert' : 'Hold Ctrl+Win or press Ctrl+Alt+R'}
            </span>
          </div>
        </div>

        {/* Model Status bar (For Local Whisper) */}
        {config.engine === 'whisper' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-glass)', width: '100%', paddingTop: '12px', justifyContent: 'center', marginTop: '10px' }}>
            <Cpu size={14} style={{ color: modelStatus === 'ready' ? '#28c93f' : 'var(--accent-blue)' }} />
            <span>Active Model:</span>
            <strong style={{ color: modelStatus === 'ready' ? '#28c93f' : 'var(--text-primary)' }}>
              {config.whisperModel} ({modelStatus.toUpperCase()})
            </strong>
            {modelMessage && <span style={{ color: 'var(--text-muted)' }}> - {modelMessage}</span>}
          </div>
        )}
      </div>

      {/* Transcription Results Card */}
      {transcription && (
        <div className="glass-panel animate-slide-in" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Latest Transcription
            </span>
            <button 
              onClick={() => handleCopy(transcription, 'latest')}
              className="glass"
              style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', border: '1px solid var(--border-glass)', background: 'transparent', color: 'var(--text-secondary)', transition: 'var(--transition-smooth)' }}
            >
              {copiedIndex === 'latest' ? <Check size={14} style={{ color: '#28c93f' }} /> : <Copy size={14} />}
              {copiedIndex === 'latest' ? 'Copied' : 'Copy Text'}
            </button>
          </div>
          <div 
            style={{ 
              backgroundColor: '#f9fafb', 
              padding: '16px', 
              borderRadius: '8px', 
              fontSize: '14px', 
              lineHeight: 1.6, 
              color: 'var(--text-primary)',
              minHeight: '60px',
              border: '1px solid var(--border-glass)'
            }}
          >
            {isTranscribing && transcription === 'Recording audio...' ? (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Recording audio...</span>
            ) : isTranscribing ? (
              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{transcription}</span>
            ) : (
              transcription
            )}
          </div>
        </div>
      )}
    </div>
  );
}
