import React, { useState } from 'react';
import { Clock, Mic, Gauge, Keyboard, BookOpen, ArrowUpRight, Edit2, Trash2, Copy, Check } from 'lucide-react';

export default function MainDashboard({ history, onUpdateHistory }) {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState('');

  // Helper to resolve duration in seconds
  const getDuration = (item) => {
    if (item.duration !== undefined) return item.duration;
    const wc = item.wordCount || (item.formatted ? item.formatted.trim().split(/\s+/).length : 0);
    return Math.max(1, Math.round(wc / 2.5)); // Fallback estimate: 2.5 words per second
  };

  // Helper to resolve word count
  const getWordCount = (item) => {
    if (item.wordCount !== undefined) return item.wordCount;
    return item.formatted ? item.formatted.trim().split(/\s+/).filter(Boolean).length : 0;
  };

  // Calculations
  const totalSessions = history.length;
  const totalWords = history.reduce((sum, item) => sum + getWordCount(item), 0);
  const totalDuration = history.reduce((sum, item) => sum + getDuration(item), 0);

  // Time Typing: avg 40 WPM => 1.5 seconds per word
  const timeTyping = totalWords * 1.5;
  // Time Saved = Typing Time - Speaking Time
  let timeSavedSeconds = Math.round(timeTyping - totalDuration);
  if (timeSavedSeconds < totalWords && totalWords > 0) {
    timeSavedSeconds = totalWords; // guarantee at least 1s saved per word
  }
  if (totalSessions === 0) timeSavedSeconds = 0;

  // Format Time Saved
  const formatTimeSaved = (secs) => {
    if (secs === 0) return '0 seconds';
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    
    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
  };

  // Keystrokes Saved: avg 5 characters per word
  const keystrokesSaved = totalWords * 5;

  // Average WPM
  const wpmList = history.map(item => {
    const wc = getWordCount(item);
    const dur = getDuration(item);
    return dur > 0 ? Math.round((wc / dur) * 60) : 130;
  }).filter(wpm => wpm > 0);
  
  const avgWpm = wpmList.length > 0 
    ? Math.round(wpmList.reduce((a, b) => a + b, 0) / wpmList.length) 
    : 0;

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
        const wc = editText.trim().split(/\s+/).filter(Boolean).length;
        return { 
          ...item, 
          formatted: editText,
          wordCount: wc 
        };
      }
      return item;
    });
    onUpdateHistory(updated);
    setEditingIndex(null);
  };

  const openLink = (url) => {
    if (window.electronAPI) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="dashboard-container animate-slide-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', height: '100%', overflowY: 'auto' }}>
      
      {/* Hero Card */}
      <div 
        className="glass-panel" 
        style={{ 
          background: 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)', 
          border: 'none',
          padding: '24px', 
          borderRadius: '16px',
          color: '#ffffff',
          boxShadow: '0 8px 24px rgba(0, 122, 255, 0.15)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            VoiceInk Savings
          </span>
          <h2 style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            You saved {formatTimeSaved(timeSavedSeconds)} of typing
          </h2>
          <p style={{ fontSize: '13px', opacity: 0.9 }}>
            Dictating is 4x faster than typing. Keep using VoiceInk to maximize productivity!
          </p>
        </div>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255, 255, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContents: 'center', justifyContent: 'center' }}>
          <Clock size={24} style={{ color: '#ffffff' }} />
        </div>
      </div>

      {/* Grid of Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Total Sessions</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(0,122,255,0.06)' }}>
              <Mic size={16} style={{ color: 'var(--accent-blue)' }} />
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>{totalSessions}</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>voice notes recorded</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Words Dictated</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(40,201,63,0.06)' }}>
              <Keyboard size={16} style={{ color: '#28c93f' }} />
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>{totalWords.toLocaleString()}</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>words transcribed</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Avg Dictation Speed</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(255,189,46,0.06)' }}>
              <Gauge size={16} style={{ color: '#ffbd2e' }} />
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>{avgWpm} <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>WPM</span></h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>average words per minute</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Keystrokes Saved</span>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(255,95,86,0.06)' }}>
              <Clock size={16} style={{ color: '#ff5f56' }} />
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>{keystrokesSaved.toLocaleString()}</h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>keys skipped from typing</span>
          </div>
        </div>

      </div>

      {/* Main Content Split Area: History & Resources */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Side: History */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: '300px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Recent Dictation Sessions</h3>
          
          {history.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', padding: '60px 0', gap: '8px' }}>
              <span>No dictation sessions recorded yet.</span>
              <span style={{ fontSize: '11px', opacity: 0.8 }}>Go to "Transcribe Audio" tab or use global shortcut to record!</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
              {history.map((item, idx) => (
                <div 
                  key={idx} 
                  className="glass" 
                  style={{ 
                    padding: '14px', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-glass)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    background: '#f9fafb'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{item.timestamp}</span>
                      <span 
                        style={{ 
                          fontSize: '10px', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          background: 'var(--accent-blue-glow)', 
                          color: 'var(--accent-blue)',
                          fontWeight: 600
                        }}
                      >
                        {item.mode}
                      </span>
                      {getDuration(item) > 0 && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {getDuration(item)}s duration
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                      <button 
                        onClick={() => handleCopy(item.formatted, idx)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="Copy to clipboard"
                      >
                        {copiedIndex === idx ? <Check size={14} style={{ color: '#28c93f' }} /> : <Copy size={14} />}
                      </button>
                      <button 
                        onClick={() => startEditingHistory(idx, item.formatted)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="Edit transcription"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteHistory(idx)}
                        style={{ background: 'transparent', border: 'none', color: '#ff3b30', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title="Delete session"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {editingIndex === idx ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <textarea 
                        className="input-field" 
                        value={editText} 
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        style={{ width: '100%', fontSize: '13px', lineHeight: 1.5 }}
                      />
                      <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end' }}>
                        <button className="neon-button secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setEditingIndex(null)}>Cancel</button>
                        <button className="neon-button" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => saveEditingHistory(idx)}>Save Changes</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                      {item.formatted}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Promotion & Resources */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Help & Resources Card */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BookOpen size={16} style={{ color: 'var(--accent-blue)' }} /> Help & Resources
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
              <button 
                onClick={() => openLink('https://github.com/madebyhidden/VoInked')}
                className="glass" 
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-glass)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, transition: 'var(--transition-smooth)' }}
              >
                <span>Documentation</span>
                <ArrowUpRight size={14} />
              </button>
              <button 
                onClick={() => openLink('https://github.com/madebyhidden/VoInked/issues')}
                className="glass" 
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-glass)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500, transition: 'var(--transition-smooth)' }}
              >
                <span>Report an Issue</span>
                <ArrowUpRight size={14} />
              </button>
            </div>
          </div>

          {/* Premium Promotion Banner */}
          <div 
            className="glass-panel" 
            style={{ 
              padding: '20px', 
              background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)', 
              border: '1px solid rgba(0, 0, 0, 0.04)',
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px',
              borderRadius: '12px'
            }}
          >
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1d1d1f' }}>Upgrade to VoiceInk Pro</h4>
            <p style={{ fontSize: '11px', color: '#4b5563', lineHeight: 1.4 }}>
              Get access to custom translation languages, cloud model integrations, and priority translation performance.
            </p>
            <button 
              className="neon-button" 
              style={{ width: '100%', marginTop: '4px', fontSize: '12px', fontWeight: 600 }}
              onClick={() => openLink('https://github.com/madebyhidden/VoInked')}
            >
              Learn More
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
