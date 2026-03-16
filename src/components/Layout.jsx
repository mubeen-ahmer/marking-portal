import { useAuth } from '../contexts/AuthContext';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const NAV_ITEMS = {
  admin: [
    { to: '/admin/batches',   icon: '📦', label: 'Batches' },
    { to: '/admin/students',  icon: '👥', label: 'Students' },
    { to: '/admin/teachers',  icon: '📋', label: 'Teachers' },
    { to: '/admin/resources', icon: '📚', label: 'Resources' },
  ],
  teacher: [
    { to: '/teacher/marks',    icon: '📊', label: 'Marks & Assessments' },
    { to: '/teacher/quizzes',  icon: '🧪', label: 'Quizzes' },
    { to: '/teacher/password', icon: '🔒', label: 'Change Password' },
  ],
  student: [
    { to: '/student/subjects',  icon: '📖', label: 'Subjects' },
    { to: '/student/quizzes',   icon: '🧪', label: 'Quizzes' },
    { to: '/student/password',  icon: '🔒', label: 'Change Password' },
  ],
};

const ROLE_LABEL = { admin: 'Admin', teacher: 'Teacher', student: 'Student' };

export default function Layout() {
  const { profile, role, studentData, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV_ITEMS[role] || [];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div id="app">
      <div className="topbar">
        <div className="tb-l">
          <span className="tb-logo">EduMark</span>
          <span className="tb-pipe"></span>
          <span className="tb-sec">{ROLE_LABEL[role] || ''}</span>
        </div>
        <div className="tb-r">
          <span className="tb-name">{profile?.full_name}</span>
          <button className="btn-so" onClick={handleLogout}>Logout</button>
        </div>
      </div>
      <div className="app-body">
        <div className="sidebar">
          {role === 'student' && studentData && (
            <div className="sb-card">
              <div className="sn">{profile?.full_name}</div>
              <div className="sr">{studentData?.roll_no || '—'}</div>
              <div style={{ marginTop: '.5rem', paddingTop: '.5rem', borderTop: '1px solid var(--border)', fontSize: '.75rem', color: 'var(--text2)', lineHeight: 1.8 }}>
                <div>Batch: <strong>{studentData?.batches?.name || '—'}</strong></div>
                <div>Course: <strong>{studentData?.batches?.courses?.name || '—'}</strong></div>
              </div>
            </div>
          )}
          <div className="sb-lbl">Navigation</div>
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sb-item ${isActive ? 'active' : ''}`}
            >
              <span className="ico">{item.icon}</span> {item.label}
            </NavLink>
          ))}
          {role === 'student' && (
            <a className="sb-item" href="/resources" target="_blank" rel="noopener noreferrer">
              <span className="ico">📚</span> Resources ↗
            </a>
          )}
        </div>
        <div className="main">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
