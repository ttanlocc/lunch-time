// client/src/components/NameSelector.jsx
import { useState } from 'react';

export function NameSelector({ names, selected, onSelect }) {
  const [showInput, setShowInput] = useState(false);
  const [newName, setNewName] = useState('');

  function handleNewName(e) {
    e.preventDefault();
    if (newName.trim()) {
      onSelect(newName.trim());
      setNewName('');
      setShowInput(false);
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 14, boxShadow: '0 2px 8px rgba(180,140,220,0.07)', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#c084fc', marginBottom: 10 }}>
        Bạn là ai?
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {names.map(name => (
          <button key={name} onClick={() => onSelect(name)} style={{
            padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
            borderColor: selected === name ? 'transparent' : '#e0d6f0',
            background: selected === name ? 'linear-gradient(135deg,#f9a8d4,#c084fc)' : '#fff',
            color: selected === name ? '#fff' : '#7c6f8e',
            boxShadow: selected === name ? '0 2px 8px rgba(192,132,252,0.3)' : 'none',
          }}>
            {name}
          </button>
        ))}
        {!showInput ? (
          <button onClick={() => setShowInput(true)} style={{ padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1.5px dashed #c084fc', background: '#fff', color: '#c084fc' }}>
            + Tên mới
          </button>
        ) : (
          <form onSubmit={handleNewName} style={{ display: 'flex', gap: 6 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nhập tên..." style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid #c084fc', fontSize: 13, outline: 'none', width: 120 }} />
            <button type="submit" style={{ padding: '6px 12px', borderRadius: 20, background: 'linear-gradient(135deg,#f9a8d4,#c084fc)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>OK</button>
          </form>
        )}
      </div>
    </div>
  );
}
