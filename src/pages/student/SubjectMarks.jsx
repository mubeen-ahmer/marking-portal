import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

export default function SubjectMarks() {
  const { subjectId } = useParams();
  const { profile, studentData } = useAuth();
  const [subjectName, setSubjectName] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || !studentData) return;
    (async () => {
      const { data: subj } = await supabase.from('subjects').select('name').eq('id', subjectId).single();
      setSubjectName(subj?.name || '');
      const batchId = studentData.batch_id;
      const { data: assess } = await supabase.from('assessments')
        .select('id, title, total_marks, created_at')
        .eq('batch_id', batchId).eq('subject_id', subjectId).order('created_at');
      const enriched = await Promise.all((assess || []).map(async a => {
        const { data: mark } = await supabase.from('marks')
          .select('obtained_marks').eq('assessment_id', a.id).eq('student_id', profile.id).maybeSingle();
        return { ...a, obtained: mark?.obtained_marks ?? null };
      }));
      setAssessments(enriched);
      setLoading(false);
    })();
  }, [profile, studentData, subjectId]);

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  const total = assessments.reduce((a, c) => a + c.total_marks, 0);
  const obtained = assessments.reduce((a, c) => a + (c.obtained ?? 0), 0);
  const pct = total > 0 ? Math.round((obtained / total) * 100) : 0;

  return (
    <div>
      <div className="pg-hd">
        <Link to="/student/subjects" className="btn btn-outline btn-sm" style={{ marginBottom: '.6rem', textDecoration: 'none' }}>← Back to Subjects</Link>
        <h2>{subjectName}</h2>
        <p>Your marks for all assessments</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="pw-box" style={{ minWidth: 120, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--fm)', fontSize: '.6rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Total</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{obtained} / {total}</div>
        </div>
        <div className="pw-box" style={{ minWidth: 120, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--fm)', fontSize: '.6rem', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Percentage</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}><span className={`pill ${pct >= 70 ? 'pill-pass' : pct >= 40 ? 'pill-avg' : 'pill-fail'}`}>{pct}%</span></div>
        </div>
      </div>

      <div className="tbl-card">
        <div className="tbl-hd"><h3>Assessments ({assessments.length})</h3></div>
        <table><thead><tr><th>Assessment</th><th className="c">Obtained</th><th className="c">Total</th><th className="c">%</th><th>Date</th></tr></thead>
          <tbody>
            {assessments.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No assessments yet</td></tr> :
              assessments.map(a => {
                const p = a.total_marks > 0 && a.obtained !== null ? Math.round((a.obtained / a.total_marks) * 100) : null;
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.title}</td>
                    <td className="c" style={{ fontFamily: 'var(--fm)', fontWeight: 700 }}>{a.obtained !== null ? a.obtained : '—'}</td>
                    <td className="c" style={{ fontFamily: 'var(--fm)' }}>{a.total_marks}</td>
                    <td className="c">{p !== null ? <span className={`pill ${p >= 70 ? 'pill-pass' : p >= 40 ? 'pill-avg' : 'pill-fail'}`}>{p}%</span> : '—'}</td>
                    <td style={{ fontFamily: 'var(--fm)', fontSize: '.76rem', color: 'var(--text2)' }}>{new Date(a.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
