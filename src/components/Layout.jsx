import { useAuth } from '../contexts/AuthContext';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const NAV_ITEMS = {
  admin: [
    { to: '/admin/dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>, label: 'Dashboard' },
    { to: '/admin/batches',   icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>, label: 'Batches' },
    { to: '/admin/students',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>, label: 'Students' },
    { to: '/admin/teachers',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>, label: 'Teachers' },
    { to: '/admin/resources', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>, label: 'Resources' },
  ],
  teacher: [
    { to: '/teacher/dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>, label: 'Dashboard' },
    { to: '/teacher/marks',     icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>, label: 'Assessments' },
    { to: '/teacher/quizzes',   icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>, label: 'Quizzes' },
    { to: '/teacher/password',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>, label: 'Change Password' },
  ],
  student: [
    { to: '/student/subjects',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>, label: 'Subjects' },
    { to: '/student/quizzes',   icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>, label: 'Quizzes' },
    { to: '/student/password',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>, label: 'Change Password' },
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
      <div className={`topbar role-${role}`}>
        <div className="tb-l">
          <span className="tb-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            EduMark
          </span>
          <span className="tb-pipe"></span>
          <span className="tb-sec">{ROLE_LABEL[role] || ''}</span>
        </div>
        <div className="tb-r">
          <span className="tb-name">{profile?.full_name}</span>
          <button className="btn-so" onClick={handleLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </button>
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
              <span className="ico" style={{ display: 'flex', alignItems: 'center' }}>{item.icon}</span> 
              <span className="lbl">{item.label}</span>
            </NavLink>
          ))}
          {role === 'student' && (
            <a className="sb-item" href="/resources" target="_blank" rel="noopener noreferrer">
              <span className="ico" style={{ display: 'flex', alignItems: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              </span> 
              <span className="lbl">Resources ↗</span>
            </a>
          )}
        </div>
        <div className="main">
          <Outlet />
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="mobile-nav">
        <div className="mobile-nav-inner">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label.split(' ')[0]}</span>
            </NavLink>
          ))}
          <button className="mobile-nav-item" onClick={handleLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Logout</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
