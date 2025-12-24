import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { authApi } from '../services/api';
import type { Tribe } from '@travian/shared';
import styles from './AuthPages.module.css';

const TRIBES: { value: Tribe; name: string; description: string }[] = [
  {
    value: 'romans',
    name: 'Romans',
    description: 'Balanced tribe with strong infantry. Can build and upgrade simultaneously.',
  },
  {
    value: 'gauls',
    name: 'Gauls',
    description: 'Defensive tribe with fast cavalry and merchants.',
  },
  {
    value: 'teutons',
    name: 'Teutons',
    description: 'Aggressive tribe with cheap troops and high carrying capacity.',
  },
];

export function RegisterPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tribe, setTribe] = useState<Tribe>('romans');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await authApi.register(email, password, username, tribe);
      login(response.data.token, response.data.user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1>Join the Realm</h1>
          <p className="text-muted">Create your empire</p>
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
            <label className="form-label">Username</label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={20}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Choose Your Tribe</label>
            <div className={styles.tribeSelector}>
              {TRIBES.map((t) => (
                <label
                  key={t.value}
                  className={`${styles.tribeOption} ${tribe === t.value ? styles.selected : ''}`}
                >
                  <input
                    type="radio"
                    name="tribe"
                    value={t.value}
                    checked={tribe === t.value}
                    onChange={() => setTribe(t.value)}
                  />
                  <div className={styles.tribeContent}>
                    <strong>{t.name}</strong>
                    <span className="text-sm text-muted">{t.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%' }}
          >
            {isLoading ? 'Creating empire...' : 'Start Your Empire'}
          </button>
        </form>

        <div className={styles.footer}>
          <p>
            Already have an account?{' '}
            <Link to="/login">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
