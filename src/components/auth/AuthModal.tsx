import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { AppIcon } from '../ui/AppIcon';
import './AuthModal.css';

export default function AuthModal() {
  const { authModalOpen, closeAuthModal, login, register, loginDemo } = useAuth();
  const modalRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Form states
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authModalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = modalRef.current;
    const getFocusable = () => dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    );
    dialog?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled])')?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAuthModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (!focusable?.length) {
          e.preventDefault();
          dialog?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previous?.isConnected) previous.focus();
    };
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
      <div ref={modalRef} className="auth-modal-container" role="dialog" aria-modal="true" aria-label={tab === 'login' ? 'Sign in to Shadow Code' : 'Create a Shadow Code account'} tabIndex={-1}>
        <div className="auth-modal-header">
          <button
            type="button"
            className="auth-modal-close"
            onClick={closeAuthModal}
            aria-label="Close"
          >
            <AppIcon name="x" size={18} />
          </button>
          <div className="auth-modal-brand">
            <span><AppIcon name="zap" size={18} /></span>
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
              <span><AppIcon name="alertTriangle" size={16} /></span>
              <span>{error}</span>
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-username">
              {tab === 'login' ? 'Username or Email' : 'Hunter Username'}
            </label>
            <input
              id="auth-username"
              type="text"
              className="auth-input"
              required
              placeholder={tab === 'login' ? 'ShadowMonarch or email' : 'e.g. JinWoo'}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {tab === 'register' && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-email">Email Address</label>
              <input
                id="auth-email"
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
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
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
              <label className="auth-label" htmlFor="auth-confirm-password">Confirm Password</label>
              <input
                id="auth-confirm-password"
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
            <span><AppIcon name="swords" size={18} /></span>
            <span>Play as Demo Hunter (ShadowMonarch)</span>
          </button>
        </form>
      </div>
    </div>
  );
}
