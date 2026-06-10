import React, { useState, useEffect, useRef } from 'react';
import { BadgeCheck, Sparkles } from 'lucide-react';

export default function RecordingOverlay() {
  const [transcription, setTranscription] = useState('');
  const [waveform, setWaveform] = useState([]);
  const [status, setStatus] = useState('recording'); // 'recording' | 'processing' | 'done'

  // Make body background transparent for the overlay window
  useEffect(() => {
    document.body.style.background = 'transparent';
    document.body.style.backgroundColor = 'transparent';
    return () => {
      document.body.style.background = '';
      document.body.style.backgroundColor = '';
    };
  }, []);

  useEffect(() => {
    if (window.electronAPI) {
      const unsubStart = window.electronAPI.onStartRecording(() => {
        setStatus('recording');
        setTranscription('');
        setWaveform([]);
      });

      const unsubStop = window.electronAPI.onStopRecording(() => {
        setStatus('processing');
        setTranscription('Processing...');
        setWaveform([]);
      });

      const unsubTrans = window.electronAPI.onTranscriptionPreview((text) => {
        setTranscription(text);
        if (text === 'Copied to clipboard!' || text === 'Copied!') {
          setStatus('done');
        }
      });

      const unsubWave = window.electronAPI.onWaveformUpdate((waveData) => {
        setWaveform(waveData);
      });

      return () => {
        unsubStart();
        unsubStop();
        unsubTrans();
        unsubWave();
      };
    }
  }, []);

  const dotsCount = 18;

  // Render the Siri-like dot wave
  const renderDots = () => {
    return Array.from({ length: dotsCount }).map((_, i) => {
      let scale = 1;
      let opacity = 0.5;
      let animation = 'none';

      if (status === 'recording') {
        // Map real-time volume waveform data to scale/opacity
        const waveVal = waveform[i] || 0;
        scale = 1 + (waveVal / 128) * 1.6;
        opacity = 0.3 + (waveVal / 128) * 0.7;
      } else if (status === 'processing') {
        // Waving loader animation when transcribing
        animation = `overlay-wave-dot 1.2s infinite ease-in-out`;
      }

      return (
        <div 
          key={i} 
          style={{ 
            width: '6px', 
            height: '6px', 
            borderRadius: '50%', 
            backgroundColor: '#ffffff', 
            transform: `scale(${scale})`,
            opacity: opacity,
            animation: animation,
            animationDelay: `${i * 0.06}s`,
            transition: 'transform 0.08s ease, opacity 0.08s ease',
            margin: '0 4px',
            flexShrink: 0
          }}
        />
      );
    });
  };

  const showText = status === 'done' || (transcription && transcription !== 'Processing...' && transcription !== 'Listening...' && transcription !== 'Recording audio...');

  return (
    <div 
      style={{ 
        width: '100%', 
        height: '100%', 
        borderRadius: '9999px', // Capsule design
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '0 24px',
        boxSizing: 'border-box',
        background: 'rgba(10, 10, 10, 0.95)', // Solid black glass pill
        color: '#ffffff',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {/* Wave Dot Animation Style Injection */}
      <style>{`
        @keyframes overlay-wave-dot {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.8); opacity: 1; }
        }
        @keyframes overlay-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* Left Rosette Badge Check */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <BadgeCheck 
          size={24} 
          style={{ 
            color: status === 'done' ? '#30d158' : '#a0a0a5', 
            transition: 'color 0.4s ease' 
          }} 
        />
      </div>

      {/* Center content (Dynamic Dots visualizer or Ticker Text) */}
      <div 
        style={{ 
          flex: 1, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '0 16px',
          overflow: 'hidden',
          minWidth: 0
        }}
      >
        {showText ? (
          <div 
            style={{ 
              fontSize: '13px', 
              fontWeight: 500, 
              color: '#ffffff',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              textAlign: 'center',
              width: '100%',
              animation: 'fade-in 0.2s ease-out'
            }}
          >
            {transcription}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {renderDots()}
          </div>
        )}
      </div>

      {/* Right Sparkles */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Sparkles 
          size={20} 
          style={{ 
            color: '#a0a0a5',
            animation: status === 'processing' ? 'overlay-spin 2s linear infinite' : 'none'
          }} 
        />
      </div>
    </div>
  );
}
