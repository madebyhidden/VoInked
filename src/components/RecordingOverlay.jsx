import React, { useState, useEffect, useRef } from 'react';

export default function RecordingOverlay() {
  const [transcription, setTranscription] = useState('Listening...');
  const [waveform, setWaveform] = useState([]);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (window.electronAPI) {
      const unsubTrans = window.electronAPI.onTranscriptionPreview((text) => {
        setTranscription(text || 'Listening...');
      });

      const unsubWave = window.electronAPI.onWaveformUpdate((waveData) => {
        setWaveform(waveData);
      });

      const unsubStop = window.electronAPI.onStopRecording(() => {
        setTranscription('Processing...');
        setWaveform([]);
      });

      return () => {
        unsubTrans();
        unsubWave();
        unsubStop();
      };
    }
  }, []);

  // Draw Audio Waveform inside the pill canvas in real time
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
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    ctx.strokeStyle = '#007aff'; // System Blue
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const barWidth = width / waveform.length;
    for (let i = 0; i < waveform.length; i++) {
      const v = waveform[i] / 128.0;
      const y = (v * height) / 2.2;
      const x = i * barWidth;
      const heightOffset = height / 2;
      
      if (i === 0) {
        ctx.moveTo(x, heightOffset - y / 2);
      } else {
        ctx.lineTo(x, heightOffset - y / 2);
      }
    }
    ctx.stroke();
  }, [waveform]);

  return (
    <div 
      className="glass" 
      style={{ 
        width: '100%', 
        height: '100%', 
        borderRadius: '40px', // Pill design
        border: '1px solid rgba(255, 255, 255, 0.15)',
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 24px',
        boxSizing: 'border-box',
        background: 'rgba(28, 28, 30, 0.85)',
        color: '#ffffff',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
        overflow: 'hidden'
      }}
    >
      {/* Pulsing Recording Indicator */}
      <div 
        style={{ 
          width: '10px', 
          height: '10px', 
          borderRadius: '50%', 
          backgroundColor: '#ff453a', // system red
          flexShrink: 0,
          marginRight: '16px',
          animation: 'pulse-ring 1s infinite'
        }}
      />

      {/* Mini Waveform Canvas */}
      <canvas 
        ref={canvasRef} 
        width={100} 
        height={32} 
        style={{ width: '100px', height: '32px', marginRight: '16px', opacity: 0.8 }} 
      />

      {/* Vertical separator */}
      <div style={{ height: '24px', width: '1px', background: 'rgba(255, 255, 255, 0.15)', marginRight: '16px' }} />

      {/* Transcription scrolling ticker */}
      <div 
        style={{ 
          flex: 1, 
          minWidth: 0, 
          overflow: 'hidden', 
          position: 'relative',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <div 
          style={{ 
            fontSize: '13px', 
            fontWeight: 500, 
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            color: 'var(--text-primary)',
            width: '100%'
          }}
        >
          {transcription}
        </div>
      </div>
    </div>
  );
}
