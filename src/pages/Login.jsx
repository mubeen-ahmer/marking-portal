import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ROLES = [
  { value: 'admin', label: 'Admin', hint: 'admin@example.com' },
  { value: 'teacher', label: 'Teacher', hint: 'teacher@example.com' },
  { value: 'student', label: 'Student', hint: 'AB25-001' },
];

export default function Login() {
  const { login, profile } = useAuth();
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState('admin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect
  if (profile) {
    const dest = `/${profile.role}/${profile.role === 'admin' ? 'batches' : profile.role === 'teacher' ? 'marks' : 'subjects'}`;
    navigate(dest, { replace: true });
    return null;
  }

  const getEmail = () => {
    if (selectedRole === 'student') {
      const roll = identifier.trim().toLowerCase();
      return `${roll}@student.local`;
    }
    return identifier.trim();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password) { setError('Fill all fields'); return; }
    setLoading(true);
    try {
      const email = getEmail();
      await login(email, password);
      const dest = selectedRole === 'admin' ? '/admin/batches' : selectedRole === 'teacher' ? '/teacher/marks' : '/student/subjects';
      navigate(dest, { replace: true });
    } catch {
      setError('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const activeRole = ROLES.find(r => r.value === selectedRole);

  return (
    <div id="login-page">
      <div className="login-card">
        <div className="ll">
          <div className="ll-top">
            <h2>EduMark</h2>
            <p>Manage batches, students, teachers, marks, quizzes, and resources — all in one secure platform.</p>
          </div>
          <div className="ll-footer">EduMark Portal</div>
        </div>
        <div className="lr">
          <h3>Sign In</h3>
          <p>Select your role and enter credentials</p>

          <div className="role-tabs">
            {ROLES.map(r => (
              <button
                key={r.value}
                className={`role-tab ${selectedRole === r.value ? 'active' : ''}`}
                onClick={() => { setSelectedRole(r.value); setError(''); setIdentifier(''); }}
                type="button"
              >
                {r.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>{selectedRole === 'student' ? 'Roll Number' : 'Email'}</label>
              <input
                type={selectedRole === 'student' ? 'text' : 'email'}
                placeholder={activeRole?.hint}
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                autoComplete="username"
                style={selectedRole === 'student' ? { fontFamily: 'var(--fm)', letterSpacing: '.08em', textTransform: 'uppercase' } : {}}
              />
            </div>
            <div className="field">
              <label>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: '2.4rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="eye-btn"
                >
                  {showPw ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            {error && <div className="err">{error}</div>}
            <button className="btn-login" type="submit" disabled={loading}>
              {loading ? <><span className="spin"></span> Signing in…</> : 'Sign In →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
