import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@forge/bridge';

function initials(name) {
  return (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function UserPicker({ value = [], onChange, placeholder = 'Search by name or email…' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await invoke('searchUsers', { query: q });
        setResults(r ?? []);
        setOpen(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const add = useCallback(user => {
    if (value.some(u => u.accountId === user.accountId)) return;
    onChange([...value, user]);
    setQuery('');
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }, [value, onChange]);

  const remove = useCallback(accountId => {
    onChange(value.filter(u => u.accountId !== accountId));
  }, [value, onChange]);

  return (
    <div className="user-picker" ref={containerRef}>
      <div
        className="user-picker__field"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map(user => (
          <span key={user.accountId} className="user-chip">
            <span className="user-chip__av">{initials(user.displayName)}</span>
            <span className="user-chip__name">{user.displayName}</span>
            <button
              className="user-chip__rm"
              onClick={e => { e.stopPropagation(); remove(user.accountId); }}
              type="button"
              title="Remove"
            >×</button>
          </span>
        ))}
        <div className="user-picker__input-wrap">
          <input
            ref={inputRef}
            className="user-picker__input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={value.length === 0 ? placeholder : 'Add another…'}
          />
          {searching && <span className="up-spin" />}
        </div>
      </div>

      {open && (
        <div className="user-picker__dd">
          {results.length > 0 ? results.map(user => (
            <button
              key={user.accountId}
              className="user-picker__opt"
              type="button"
              onClick={() => add(user)}
            >
              <span className="up-opt-av">{initials(user.displayName)}</span>
              <span>
                <span className="up-opt-name">{user.displayName}</span>
                {user.emailAddress && <span className="up-opt-email">{user.emailAddress}</span>}
              </span>
            </button>
          )) : (
            <div className="user-picker__empty">No users found for "{query}"</div>
          )}
        </div>
      )}
    </div>
  );
}
