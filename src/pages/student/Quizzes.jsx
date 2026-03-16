import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

export default function Quizzes() {
  const { profile, studentData } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || !studentData) return;
    (async () => {
      const batchId = studentData.batch_id;
      const { data: qs } = await supabase.from('quizzes')
        .select('id, title, time_limit_mins, max_attempts, expires_at, pushed_to_assessments, created_at')
        .eq('batch_id', batchId).order('created_at', { ascending: false });

      const enriched = await Promise.all((qs || []).map(async q => {
        const { data: attempts } = await supabase.from('quiz_attempts')
          .select('id, is_submitted, score, total')
          .eq('quiz_id', q.id).eq('student_id', profile.id);
        const submittedAttempts = (attempts || []).filter(a => a.is_submitted);
        const bestScore = submittedAttempts.length > 0 ? Math.max(...submittedAttempts.map(a => a.score)) : null;
        const bestTotal = submittedAttempts.length > 0 ? submittedAttempts[0]?.total : null;
        const expired = new Date(q.expires_at) < new Date();
        const canAttempt = !expired && submittedAttempts.length < q.max_attempts;
        const inProgress = (attempts || []).find(a => !a.is_submitted);
        return {
          ...q,
          submittedCount: submittedAttempts.length,
          bestScore, bestTotal,
          expired, canAttempt, inProgress,
          published: q.pushed_to_assessments === true,
        };
      }));
      setQuizzes(enriched);
      setLoading(false);
    })();
  }, [profile, studentData]);

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  return (
    <div>
      <div className="pg-hd"><h2>Quizzes</h2><p>Available quizzes for your batch</p></div>
      <div className="tbl-card">
        <div className="tbl-hd"><h3>Quizzes ({quizzes.length})</h3></div>
        <table><thead><tr><th>Title</th><th>Time</th><th>Status</th><th className="c">Attempts</th><th className="c">Score</th><th>Actions</th></tr></thead>
          <tbody>
            {quizzes.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No quizzes available</td></tr> :
              quizzes.map(q => (
                <tr key={q.id}>
                  <td style={{ fontWeight: 600 }}>{q.title}</td>
                  <td style={{ fontFamily: 'var(--fm)', fontSize: '.78rem' }}>{q.time_limit_mins} min</td>
                  <td>
                    {q.published ? (
                      <span className="tag tag-green">Results Out</span>
                    ) : q.expired ? (
                      <span className="tag tag-red">Expired</span>
                    ) : (
                      <span className="tag tag-blue">Active</span>
                    )}
                  </td>
                  <td className="c" style={{ fontFamily: 'var(--fm)' }}>{q.submittedCount} / {q.max_attempts}</td>
                  <td className="c">
                    {q.published && q.bestScore !== null ? (
                      <span className={`pill ${q.bestTotal > 0 && (q.bestScore / q.bestTotal) >= 0.7 ? 'pill-pass' : (q.bestScore / q.bestTotal) >= 0.4 ? 'pill-avg' : 'pill-fail'}`}>
                        {q.bestScore}/{q.bestTotal}
                      </span>
                    ) : q.submittedCount > 0 && !q.published ? (
                      <span style={{ fontSize: '.72rem', color: 'var(--text3)', fontFamily: 'var(--fm)' }}>Pending</span>
                    ) : '—'}
                  </td>
                  <td>
                    {q.canAttempt ? (
                      <button className="btn btn-primary btn-xs" onClick={() => navigate(`/student/quizzes/${q.id}`)}>
                        {q.inProgress ? '▶ Resume' : '▶ Start'}
                      </button>
                    ) : q.submittedCount > 0 ? (
                      <span style={{ fontSize: '.72rem', color: 'var(--green)', fontFamily: 'var(--fm)' }}>✓ Submitted</span>
                    ) : q.expired ? (
                      <span style={{ fontSize: '.72rem', color: 'var(--text3)' }}>Missed</span>
                    ) : (
                      <span style={{ fontSize: '.72rem', color: 'var(--text3)' }}>Max attempts</span>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
