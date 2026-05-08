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
    <div style={{ background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 14, boxShadow: 'var(--shadow-card)', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-secondary)', marginBottom: 10 }}>
        Bạn là ai?
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {names.map(name => (
          <button key={name} onClick={() => onSelect(name)} style={{
            padding: '7px 16px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600, border: '1.5px solid',
            borderColor: selected === name ? 'transparent' : 'var(--color-border)',
            background: selected === name ? 'var(--gradient-primary)' : 'var(--color-card)',
            color: selected === name ? '#fff' : 'var(--color-text-muted)',
            boxShadow: selected === name ? 'var(--shadow-button)' : 'none',
            transition: 'all var(--transition-fast)',
          }}>
            {name}
          </button>
        ))}
        {!showInput ? (
          <button onClick={() => setShowInput(true)} style={{
            padding: '7px 16px', borderRadius: 'var(--radius-pill)', fontSize: 13, fontWeight: 600,
            border: '1.5px dashed var(--color-secondary)', background: 'var(--color-card)', color: 'var(--color-secondary)',
            transition: 'all var(--transition-fast)',
          }}>
            + Tên mới
          </button>
        ) : (
          <form onSubmit={handleNewName} style={{ display: 'flex', gap: 6 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nhập tên..." style={{ padding: '6px 12px', borderRadius: 'var(--radius-pill)', border: '1.5px solid var(--color-secondary)', fontSize: 13, outline: 'none', width: 120 }} />
            <button type="submit" style={{ padding: '6px 12px', borderRadius: 'var(--radius-pill)', background: 'var(--gradient-primary)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700 }}>OK</button>
          </form>
        )}
      </div>
    </div>
  );
}
