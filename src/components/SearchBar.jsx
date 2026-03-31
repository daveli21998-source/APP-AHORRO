import { useState, useRef } from 'react';
import { Search, X } from 'lucide-react';

export default function SearchBar({ value, onChange }) {
    const inputRef = useRef(null);

    return (
        <div className="search-wrapper">
            <Search size={20} className="search-icon" style={{ position: 'absolute', left: 36, top: '50%', transform: 'translateY(-50%)', color: value ? 'var(--primary)' : 'var(--text-3)', pointerEvents: 'none', transition: 'color 0.18s' }} />
            <input
                ref={inputRef}
                id="search-input"
                className="search-input"
                type="search"
                placeholder="Buscar por nombre o puesto..."
                value={value}
                onChange={e => onChange(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
            />
            {value && (
                <button
                    className="search-clear"
                    onClick={() => { onChange(''); inputRef.current?.focus(); }}
                    aria-label="Limpiar búsqueda"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
