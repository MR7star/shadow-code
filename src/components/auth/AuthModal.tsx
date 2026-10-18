import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './AuthModal.css';

export default function AuthModal() {
  const { authModalOpen, closeAuthModal, login, register, loginDemo } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Form states
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && authModalOpen) {
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authModalOpen, closeAuthModal]);

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (tab === 'login') {
      const res = await login(username, password);
      setLoading(false);
      if (!res.success) {
        setError(res.error || 'Failed to sign in.');
      }
    } else {
      if (password !== confirmPassword) {
        setLoading(false);
        setError('Passwords do not match.');
        return;
      }
      const res = await register(username, email, password);
      setLoading(false);
      if (!res.success) {
        setError(res.error || 'Failed to register.');
      }
    }
  };

  const handleDemoLogin = async () => {
    setError(null);
    setLoading(true);
    const res = await loginDemo();
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Failed to sign in with demo user.');
    }
  };

  return (
    <div
      className="auth-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div className="auth-modal-container" role="dialog" aria-modal="true">
        <div className="auth-modal-header">
          <button
            type="button"
            className="auth-modal-close"
            onClick={closeAuthModal}
            aria-label="Close"
          >
            ✕
          </button>
          <div className="auth-modal-brand">
            <span>⚡</span>
            <span>SHADOW CODE</span>
          </div>
          <div className="auth-modal-subtitle">
            {tab === 'login'
              ? 'Awaken your hunter profile to record genuine progress'
              : 'Begin your journey as an awakened code hunter'}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => {
              setTab('login');
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => {
              setTab('register');
              setError(null);
            }}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && (
            <div className="auth-error-banner" role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label">
              {tab === 'login' ? 'Username or Email' : 'Hunter Username'}
            </label>
            <input
              type="text"
              className="auth-input"
              required
              placeholder={tab === 'login' ? 'ShadowMonarch or email' : 'e.g. JinWoo'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          {tab === 'register' && (
            <div className="auth-field">
              <label className="auth-label">Email Address</label>
              <input
                type="email"
                className="auth-input"
                required
                placeholder="hunter@shadowcode.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input
              type="password"
              className="auth-input"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {tab === 'register' && (
            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <input
                type="password"
                className="auth-input"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={loading}>
            {loading ? 'Authenticating...' : tab === 'login' ? 'Sign In Hunter' : 'Awaken Profile'}
          </button>

          <div className="auth-divider">or explore instantly</div>

          <button
            type="button"
            className="auth-demo-btn"
            onClick={handleDemoLogin}
            disabled={loading}
          >
            <span>⚔️</span>
            <span>Play as Demo Hunter (ShadowMonarch)</span>
          </button>
        </form>
      </div>
    </div>
  );
}
