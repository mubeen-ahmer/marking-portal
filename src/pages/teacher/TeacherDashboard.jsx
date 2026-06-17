import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ assessments: 0, quizzes: 0, students: 0 });
  const [recentSubs, setRecentSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      if (!profile) return;
      try {
        // 1. Get teacher batches & subjects
        const { data: tbas } = await supabase.from('teacher_batch_assignments').select('batch_id').eq('teacher_id', profile.id);
        const { data: ts } = await supabase.from('teacher_subjects').select('subject_id, subjects(name)').eq('teacher_id', profile.id).maybeSingle();
        const batchIds = (tbas || []).map(t => t.batch_id);
        const subjectId = ts?.subject_id;

        if (batchIds.length > 0 && subjectId) {
          // Count active students in assigned batches
          const { count: studentsCount } = await supabase.from('students')
            .select('*', { count: 'exact', head: true })
            .in('batch_id', batchIds);

          // Count assessments where created_by is this teacher (or subject matches)
          const { count: assessmentsCount } = await supabase.from('assessments')
            .select('*', { count: 'exact', head: true })
            .eq('subject_id', subjectId)
            .in('batch_id', batchIds);

          // Count quizzes created by this teacher
          const { count: quizzesCount } = await supabase.from('quizzes')
            .select('*', { count: 'exact', head: true })
            .eq('created_by', profile.id);

          setStats({
            students: studentsCount || 0,
            assessments: assessmentsCount || 0,
            quizzes: quizzesCount || 0
          });

          // Fetch recent quiz submissions
          const { data: myQuizzes } = await supabase.from('quizzes').select('id, title').eq('created_by', profile.id);
          const quizIds = (myQuizzes || []).map(q => q.id);
          const idToTitle = {};
          myQuizzes?.forEach(q => idToTitle[q.id] = q.title);

          if (quizIds.length > 0) {
            const { data: recent } = await supabase.from('quiz_results')
              .select('id, quiz_id, score, total_questions_at_attempt, created_at, students(roll_no, profiles(full_name))')
              .in('quiz_id', quizIds)
              .order('created_at', { ascending: false })
              .limit(5);
              
            const mappedRecent = (recent || []).map(r => ({ ...r, quiz_title: idToTitle[r.quiz_id] }));
            setRecentSubs(mappedRecent);
          }
        }
      } catch (err) {
        console.error('Error fetching teacher stats:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [profile]);

  if (loading) return <div className="loading"><span className="spin"></span> Loading Workspace...</div>;

  return (
    <div className="dashboard-wrapper">
      <div className="pg-hd">
        <h2>Teacher Dashboard</h2>
        <p>Your classes, assessments, and recent activity at a glance.</p>
      </div>

      <div className="bento-grid">
        {/* STAT CARDS */}
        <div className="bento-card stat-card" onClick={() => navigate('/teacher/marks')}>
          <div className="stat-icon" style={{ background: 'var(--amber-bg)', color: 'var(--amber)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </div>
          <div className="stat-info">
            <span className="stat-val">{stats.assessments}</span>
            <span className="stat-lbl">Active Assessments</span>
          </div>
        </div>

        <div className="bento-card stat-card" onClick={() => navigate('/teacher/quizzes')}>
          <div className="stat-icon" style={{ background: 'var(--blue-light)', color: 'var(--blue)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
          <div className="stat-info">
            <span className="stat-val">{stats.quizzes}</span>
            <span className="stat-lbl">Created Quizzes</span>
          </div>
        </div>

        <div className="bento-card stat-card">
          <div className="stat-icon" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          </div>
          <div className="stat-info">
            <span className="stat-val">{stats.students}</span>
            <span className="stat-lbl">My Students</span>
          </div>
        </div>

        {/* RECENT SUBMISSIONS LIST */}
        <div className="bento-card recent-subs-card" style={{ gridColumn: '1 / -1' }}>
          <h3>Recent Quiz Submissions</h3>
          {recentSubs.length === 0 ? (
            <div className="empty" style={{ padding: '2rem' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.2, marginBottom: '1rem' }}><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <p>No recent quiz submissions available yet.</p>
            </div>
          ) : (
            <div className="recent-subs-list">
              {recentSubs.map((sub) => {
                const pct = (sub.score / sub.total_questions_at_attempt) * 100;
                let pctClass = 'pill-pass';
                if (pct < 50) pctClass = 'pill-fail';
                else if (pct < 75) pctClass = 'pill-avg';

                return (
                  <div key={sub.id} className="rs-item">
                    <div className="rs-info">
                      <strong>{sub.students?.profiles?.full_name}</strong>
                      <span className="rs-meta">{sub.students?.roll_no} • {sub.quiz_title}</span>
                    </div>
                    <div className="rs-score">
                      <span className={`pill ${pctClass}`}>
                        {sub.score} / {sub.total_questions_at_attempt}
                      </span>
                      <span className="rs-time">{new Date(sub.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
