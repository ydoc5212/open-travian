import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api';
import styles from './AuthPages.module.css';

const DEMO_CREDENTIALS = {
  email: 'demo@travian.local',
  password: 'demo123',
  username: 'DemoPlayer',
  tribe: 'romans',
};

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await authApi.login(email, password);
      login(response.data.token, response.data.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDemoLogin() {
    setError('');
    setIsDemoLoading(true);

    try {
      // Try to login first
      const response = await authApi.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password);
      login(response.data.token, response.data.user);
      navigate('/');
    } catch {
      // If login fails, register the demo account
      try {
        const response = await authApi.register(
          DEMO_CREDENTIALS.email,
          DEMO_CREDENTIALS.password,
          DEMO_CREDENTIALS.username,
          DEMO_CREDENTIALS.tribe
        );
        login(response.data.token, response.data.user);
        navigate('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Demo login failed');
      }
    } finally {
      setIsDemoLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1>Travian Clone</h1>
          <p className="text-muted">Enter the realm</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%' }}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className={styles.divider}>
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleDemoLogin}
          disabled={isDemoLoading}
          style={{ width: '100%' }}
        >
          {isDemoLoading ? 'Starting demo...' : 'Quick Demo (1-Click)'}
        </button>

        <div className={styles.footer}>
          <p>
            New to the realm?{' '}
            <Link to="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
