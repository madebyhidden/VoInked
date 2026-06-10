import React, { useState } from 'react';
import { Sparkles, Plus, Trash2, Edit2, Check } from 'lucide-react';

export default function SmartModes({ modes, onUpdateModes }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrompt, setEditPrompt] = useState('');

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrompt, setNewPrompt] = useState('');

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName.trim() || !newPrompt.trim()) return;

    const newMode = {
      id: 'custom-' + Date.now(),
      name: newName.trim(),
      description: newDesc.trim() || 'Custom writing formatting style.',
      prompt: newPrompt.trim(),
      isCustom: true
    };

    onUpdateModes([...modes, newMode]);
    setNewName('');
    setNewDesc('');
    setNewPrompt('');
  };

  const handleDelete = (id) => {
    onUpdateModes(modes.filter(m => m.id !== id));
  };

  const startEdit = (mode) => {
    setEditingId(mode.id);
    setEditName(mode.name);
    setEditDesc(mode.description);
    setEditPrompt(mode.prompt);
  };

  const saveEdit = (id) => {
    const updated = modes.map(m => {
      if (m.id === id) {
        return { ...m, name: editName, description: editDesc, prompt: editPrompt };
      }
      return m;
    });
    onUpdateModes(updated);
    setEditingId(null);
  };

  return (
    <div className="modes-container animate-slide-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Sparkles size={24} style={{ color: 'var(--accent-blue)' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Smart Writing Modes</h2>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '-10px' }}>
        Configure prompts used by the Gemini AI post-processor to format your spoken words into structured texts.
      </p>

      {/* Mode Creation */}
      <form onSubmit={handleCreate} className="glass-panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Create Custom AI Mode</h3>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '180px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Mode Name</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="e.g. Code Reviewer" 
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 2, minWidth: '260px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Brief Description</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Formats the transcription as PR feedback." 
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>AI System Prompt</label>
          <textarea 
            className="input-field" 
            placeholder="Format this voice transcript as a polite code review comment..."
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            rows={2}
            style={{ resize: 'vertical', fontFamily: 'var(--font-sans)', minHeight: '50px' }}
          />
        </div>

        <button type="submit" className="neon-button" style={{ alignSelf: 'flex-end', marginTop: '4px' }}>
          <Plus size={14} /> Add Mode
        </button>
      </form>

      {/* Modes List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {modes.map((mode) => {
          const isEditing = editingId === mode.id;

          return (
            <div 
              key={mode.id} 
              className="glass-panel" 
              style={{ 
                padding: '16px 20px', 
                border: isEditing ? '1px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                backgroundColor: isEditing ? 'rgba(0, 122, 255, 0.02)' : 'var(--bg-panel)'
              }}
            >
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={editName} 
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ fontWeight: 600, flex: 1 }}
                    />
                    <input 
                      type="text" 
                      className="input-field" 
                      value={editDesc} 
                      onChange={(e) => setEditDesc(e.target.value)}
                      style={{ flex: 2 }}
                    />
                  </div>
                  <textarea 
                    className="input-field" 
                    value={editPrompt} 
                    onChange={(e) => setEditPrompt(e.target.value)}
                    rows={3}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
                    <button className="neon-button secondary" onClick={() => setEditingId(null)}>Cancel</button>
                    <button className="neon-button" onClick={() => saveEdit(mode.id)}><Check size={14} /> Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{mode.name}</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{mode.description}</p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => startEdit(mode)} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', transition: 'var(--transition-smooth)' }}
                        onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
                        onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                      >
                        <Edit2 size={14} />
                      </button>
                      
                      {mode.isCustom && (
                        <button 
                          onClick={() => handleDelete(mode.id)} 
                          style={{ background: 'transparent', border: 'none', color: '#ff453a', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div 
                    style={{ 
                      marginTop: '6px', 
                      background: 'rgba(0, 0, 0, 0.15)', 
                      padding: '8px 12px', 
                      borderRadius: '6px', 
                      fontSize: '11px', 
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      border: '1px solid rgba(255, 255, 255, 0.02)'
                    }}
                  >
                    {mode.prompt}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
