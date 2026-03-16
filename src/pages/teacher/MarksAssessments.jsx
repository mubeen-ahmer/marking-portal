import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

export default function MarksAssessments() {
  const { profile } = useAuth();
  const toast = useToast();
  const [subjectName, setSubjectName] = useState('');
  const [subjectId, setSubjectId] = useState(null);
  const [batches, setBatches] = useState([]);
  const [activeBatch, setActiveBatch] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [dirty, setDirty] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ title: '', total_marks: '' });
  const [err, setErr] = useState('');

  const init = useCallback(async () => {
    if (!profile) return;
    const { data: ts } = await supabase.from('teacher_subjects').select('subject_id, subjects(name)').eq('teacher_id', profile.id).maybeSingle();
    if (ts) { setSubjectName(ts.subjects?.name || '—'); setSubjectId(ts.subject_id); }
    const { data: tbas } = await supabase.from('teacher_batch_assignments').select('batch_id, batches(id, name)').eq('teacher_id', profile.id);
    const b = (tbas || []).map(t => t.batches).filter(Boolean);
    setBatches(b);
    if (b.length > 0) setActiveBatch(b[0].id);
    setLoading(false);
  }, [profile]);

  useEffect(() => { init(); }, [init]);

  const loadBatchData = useCallback(async () => {
    if (!activeBatch || !subjectId) return;
    const { data: studs } = await supabase.from('students')
      .select('id, roll_no, profiles(full_name)')
      .eq('batch_id', activeBatch).order('roll_no');
    setStudents(studs || []);
    const { data: assess } = await supabase.from('assessments')
      .select('*').eq('batch_id', activeBatch).eq('subject_id', subjectId).order('created_at');
    setAssessments(assess || []);
    const { data: mks } = await supabase.from('marks').select('*')
      .in('assessment_id', (assess || []).map(a => a.id));
    const mkMap = {};
    (mks || []).forEach(m => { mkMap[`${m.assessment_id}__${m.student_id}`] = m; });
    setMarks(mkMap);
    setDirty({});
  }, [activeBatch, subjectId]);

  useEffect(() => { loadBatchData(); }, [loadBatchData]);

  const handleMarkChange = (assessId, studentId, val, totalVal) => {
    let num = parseFloat(val);
    if (!isNaN(num)) {
      if (num < 0) num = 0;
      if (num > parseFloat(totalVal)) num = parseFloat(totalVal);
    }
    const finalVal = val === '' ? '' : (isNaN(num) ? val : num);
    
    const key = `${assessId}__${studentId}`;
    setMarks(prev => ({ ...prev, [key]: { ...prev[key], obtained_marks: finalVal, assessment_id: assessId, student_id: studentId } }));
    setDirty(prev => ({ ...prev, [key]: true }));
  };

  const saveMarks = async () => {
    setSaving(true);
    const toSave = Object.keys(dirty).map(k => marks[k]).filter(Boolean);
    for (const m of toSave) {
      const { data: existing } = await supabase.from('marks')
        .select('id').eq('assessment_id', m.assessment_id).eq('student_id', m.student_id).maybeSingle();
      if (existing) {
        await supabase.from('marks').update({ obtained_marks: parseFloat(m.obtained_marks) || 0 }).eq('id', existing.id);
      } else {
        await supabase.from('marks').insert({ assessment_id: m.assessment_id, student_id: m.student_id, obtained_marks: parseFloat(m.obtained_marks) || 0 });
      }
    }
    toast(`Saved ${toSave.length} mark(s)!`);
    setDirty({});
    setSaving(false);
  };

  const createAssessment = async () => {
    setErr('');
    if (!form.title || !form.total_marks) { setErr('Fill all fields'); return; }
    const { error } = await supabase.from('assessments').insert({
      batch_id: activeBatch, subject_id: subjectId, title: form.title,
      total_marks: parseInt(form.total_marks), created_by: profile.id,
    });
    if (error) { setErr(error.message); return; }
    toast(`"${form.title}" created!`); setModal(null); loadBatchData();
  };

  const deleteAssessment = async (id, title) => {
    if (!confirm(`Delete "${title}"? All marks will also be deleted.`)) return;
    const { error } = await supabase.from('assessments').delete().eq('id', id);
    if (error) { toast(error.message, 'err'); return; }
    toast(`"${title}" deleted`); loadBatchData();
  };

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  const dirtyCount = Object.keys(dirty).length;

  return (
    <div>
      <div className="pg-hd">
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.2rem' }}>
          <h2>Marks & Assessments</h2>
          <span className="lock-badge">🔒 {subjectName}</span>
        </div>
        <p>Select a batch, add assessments, and enter marks.</p>
      </div>

      {batches.length === 0 ? (
        <div className="empty"><div className="ei">📭</div><p>No batches assigned to you yet. Contact admin.</p></div>
      ) : (
        <>
          <div className="batch-tabs">
            {batches.map(b => (
              <button key={b.id} className={`batch-tab ${activeBatch === b.id ? 'active' : ''}`}
                onClick={() => setActiveBatch(b.id)}>{b.name}</button>
            ))}
          </div>

          <div className="section">
            <div className="section-hd">
              <h3>📊 Assessments ({assessments.length})</h3>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                {dirtyCount > 0 && (
                  <button className="btn btn-primary btn-sm" onClick={saveMarks} disabled={saving}>
                    {saving ? <><span className="spin"></span> Saving…</> : `Save ${dirtyCount} change(s)`}
                  </button>
                )}
                <button className="btn btn-outline btn-sm" onClick={() => { setForm({ title: '', total_marks: '' }); setModal('add'); setErr(''); }}>+ Add Assessment</button>
              </div>
            </div>

            {students.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)' }}>No students in this batch</div>
            ) : assessments.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)' }}>No assessments yet. Click "+ Add Assessment" to start.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Roll No</th>
                      <th>Name</th>
                      {assessments.map(a => (
                        <th key={a.id} className="c">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.3rem' }}>
                            <span>{a.title}</span>
                            <span style={{ fontSize: '.55rem', color: 'var(--text3)' }}>/{a.total_marks}</span>
                            <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '.65rem', padding: '.1rem' }}
                              onClick={() => deleteAssessment(a.id, a.title)}>✕</button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontFamily: 'var(--fm)', color: 'var(--blue)', fontWeight: 600, fontSize: '.78rem' }}>{s.roll_no}</td>
                        <td style={{ fontWeight: 500, fontSize: '.82rem' }}>{s.profiles?.full_name || '—'}</td>
                        {assessments.map(a => {
                          const key = `${a.id}__${s.id}`;
                          const val = marks[key]?.obtained_marks ?? '';
                          return (
                            <td key={a.id} className="c">
                              <input className={`mk-input ${dirty[key] ? 'dirty' : ''}`}
                                type="number" step="0.5" min="0" max={a.total_marks}
                                onWheel={(e) => e.target.blur()}
                                value={val} onChange={e => handleMarkChange(a.id, s.id, e.target.value, a.total_marks)} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={modal === 'add'} onClose={() => setModal(null)}>
        <h3>Add Assessment</h3>
        <p className="ms">For the current batch, under {subjectName}.</p>
        <div className="field"><label>Title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Quiz 1, Midterm" /></div>
        <div className="field"><label>Total Marks</label><input type="number" min="1" onWheel={(e) => e.target.blur()} value={form.total_marks} onChange={e => setForm({ ...form, total_marks: e.target.value })} placeholder="e.g. 30" /></div>
        {err && <div className="err">{err}</div>}
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={createAssessment}>Create</button>
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
