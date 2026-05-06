import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import './LoginScreen.css';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Completa todos los campos');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      console.error('Login error:', err);
      const msg = err.message || '';
      if (msg.includes('Invalid login')) {
        setError('Correo o contraseña incorrectos');
      } else if (msg.includes('Email not confirmed')) {
        setError('Confirma tu correo electrónico primero');
      } else if (msg.includes('Too many requests')) {
        setError('Demasiados intentos. Espera un momento.');
      } else {
        setError('Error de conexión. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-bg-effect" />
      
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <Shield size={40} color="white" strokeWidth={2.5} />
        </div>

        <h1 className="login-title">AHORROS</h1>
        <p className="login-subtitle">Ingresa tus credenciales para continuar</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {/* Email */}
          <div className="login-field">
            <input
              id="login-email"
              className="login-input"
              type="email"
              placeholder="Correo electrónico"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
            <Mail size={18} className="login-field-icon" />
          </div>

          {/* Password */}
          <div className="login-field">
            <input
              id="login-password"
              className="login-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{ paddingRight: 48 }}
            />
            <Lock size={18} className="login-field-icon" />
            <button
              type="button"
              className="login-toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Error */}
          {error && <div className="login-error">⚠️ {error}</div>}

          {/* Submit */}
          <button
            id="login-submit"
            className="login-btn"
            type="submit"
            disabled={loading}
          >
            {loading ? (
              <div className="login-spinner" />
            ) : (
              '🔐 Iniciar Sesión'
            )}
          </button>
        </form>

        <div className="login-footer">
          Powered by <span>AHORROS</span> · Sistema Profesional
        </div>
      </div>
    </div>
  );
}
