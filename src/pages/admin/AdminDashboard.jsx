import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ students: 0, teachers: 0, batches: 0 });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadStats() {
      try {
        const [
          { count: students },
          { count: teachers },
          { count: batches }
        ] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }),
          supabase.from('teachers').select('*', { count: 'exact', head: true }),
          supabase.from('batches').select('*', { count: 'exact', head: true }),
        ]);
        setStats({ students: students || 0, teachers: teachers || 0, batches: batches || 0 });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) return <div className="loading"><span className="spin"></span> Loading Dashboard...</div>;

  return (
    <div className="dashboard-wrapper">
      <div className="pg-hd">
        <h2>Dashboard Overview</h2>
        <p>Welcome back, Admin. Here is what is happening today.</p>
      </div>

      <div className="bento-grid">
        {/* STAT CARDS */}
        <div className="bento-card stat-card" onClick={() => navigate('/admin/students')}>
          <div className="stat-icon" style={{ background: 'var(--blue-dim)', color: 'var(--blue)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div className="stat-info">
            <span className="stat-val">{stats.students}</span>
            <span className="stat-lbl">Total Students</span>
          </div>
        </div>

        <div className="bento-card stat-card" onClick={() => navigate('/admin/teachers')}>
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><polyline points="17 11 19 13 23 9"></polyline></svg>
          </div>
          <div className="stat-info">
            <span className="stat-val">{stats.teachers}</span>
            <span className="stat-lbl">Registered Teachers</span>
          </div>
        </div>

        <div className="bento-card stat-card" onClick={() => navigate('/admin/batches')}>
          <div className="stat-icon" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <div className="stat-info">
            <span className="stat-val">{stats.batches}</span>
            <span className="stat-lbl">Active Batches</span>
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div className="bento-card quick-actions-card">
          <h3>Quick Actions</h3>
          <div className="qa-grid">
            <button className="qa-btn qa-blue" onClick={() => navigate('/admin/students')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              <span>Assign Student</span>
            </button>
            <button className="qa-btn qa-green" onClick={() => navigate('/admin/batches')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
              <span>Create Batch</span>
            </button>
            <button className="qa-btn qa-amber" onClick={() => navigate('/admin/resources')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>
              <span>Upload Resource</span>
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}
