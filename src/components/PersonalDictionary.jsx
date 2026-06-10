import React, { useState } from 'react';
import { BookOpen, Plus, Trash2 } from 'lucide-react';

export default function PersonalDictionary({ dictionary, onUpdateDictionary }) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    
    const updated = {
      ...dictionary,
      [newKey.trim().toLowerCase()]: newValue.trim()
    };
    onUpdateDictionary(updated);
    setNewKey('');
    setNewValue('');
  };

  const handleDelete = (key) => {
    const updated = { ...dictionary };
    delete updated[key];
    onUpdateDictionary(updated);
  };

  return (
    <div className="dictionary-container animate-slide-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <BookOpen size={24} style={{ color: 'var(--accent-blue)' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Personal Dictionary</h2>
      </div>
      
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '-10px' }}>
        Train your transcription engine to replace short words, custom terms, or abbreviations automatically with correct phrases (e.g. "btw" to "by the way").
      </p>

      {/* Add New Entry Form */}
      <form onSubmit={handleAdd} className="glass-panel" style={{ padding: '16px 20px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '180px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Spoken Term</label>
          <input 
            type="text" 
            className="input-field" 
            placeholder="e.g. tg" 
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2, minWidth: '220px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Replace With</label>
          <input 
            type="text" 
            className="input-field" 
            placeholder="e.g. Telegram" 
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
          />
        </div>
        
        <button type="submit" className="neon-button" style={{ height: '36px', padding: '0 16px' }}>
          <Plus size={14} /> Add Rule
        </button>
      </form>

      {/* Rules List */}
      <div className="glass-panel" style={{ padding: '20px', flex: 1, overflowY: 'auto', minHeight: '180px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-primary)' }}>Replacement Rules</h3>
        
        {Object.keys(dictionary).length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0', fontSize: '13px' }}>
            No replacement rules defined.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Object.entries(dictionary).map(([key, val]) => (
              <div 
                key={key} 
                className="glass" 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '10px 14px', 
                  borderRadius: '6px',
                  border: '1px solid var(--border-glass)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', fontSize: '12px', background: 'rgba(0, 122, 255, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                    {key}
                  </code>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>→</span>
                  <span style={{ fontWeight: 500, fontSize: '13px' }}>{val}</span>
                </div>
                <button 
                  onClick={() => handleDelete(key)} 
                  style={{ background: 'transparent', border: 'none', color: '#ff453a', cursor: 'pointer', opacity: 0.8 }}
                  onMouseEnter={(e) => e.target.style.opacity = 1}
                  onMouseLeave={(e) => e.target.style.opacity = 0.8}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
