import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

const COURSE_SUBJECTS = {
  NUST: ['Physics','Math','Basic Math','Chemistry','English'],
  FAST: ['Math','Basic Math','IQ/Analytical Skills','English'],
  MDCAT: ['Biology','Chemistry','Physics','English','Logical Reasoning'],
  ECAT: ['Physics','Math','Chemistry','English'],
};

export default function Batches() {
  const toast = useToast();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [expandData, setExpandData] = useState([]);
  const [modal, setModal] = useState(null); // 'create' | null
  const [form, setForm] = useState({ name: '', course: '', year: new Date().getFullYear() });
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('batches').select('id, name, year, created_at, courses(name)').order('created_at');
    if (data) {
      const withCounts = await Promise.all(data.map(async b => {
        const { count } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('batch_id', b.id);
        return { ...b, studentCount: count || 0 };
      }));
      setBatches(withCounts);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = async (batchId) => {
    if (expanded === batchId) { setExpanded(null); return; }
    setExpanded(batchId);
    const { data } = await supabase.from('students')
      .select('id, roll_no, profiles(full_name, phone)')
      .eq('batch_id', batchId).order('roll_no');
    setExpandData(data || []);
  };

  const handleCreate = async () => {
    setErr('');
    if (!form.name || !form.course || !form.year) { setErr('Fill all fields'); return; }
    const { data: courses } = await supabase.from('courses').select('id, name');
    const courseId = courses?.find(c => c.name === form.course)?.id;
    if (!courseId) { setErr('Course not found'); return; }
    const { error } = await supabase.from('batches').insert({ name: form.name, course_id: courseId, year: parseInt(form.year) });
    if (error) { setErr(error.message); return; }
    toast(`Batch "${form.name}" created!`);
    setModal(null); setForm({ name: '', course: '', year: new Date().getFullYear() }); load();
  };

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  return (
    <div>
      <div className="pg-hd">
        <h2>Batches</h2>
        <p>Click any row to expand and view students in that batch</p>
      </div>
      <div className="tbl-card">
        <div className="tbl-hd">
          <h3>All Batches</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>+ Create Batch</button>
        </div>
        <table>
          <thead><tr><th>Batch Name</th><th>Course</th><th>Year</th><th className="c">Students</th><th>Created</th></tr></thead>
          <tbody>
            {batches.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No batches yet.</td></tr>
            ) : batches.map(b => (
              <React.Fragment key={b.id}>
                <tr className={`batch-row ${expanded === b.id ? 'open' : ''}`} onClick={() => toggleExpand(b.id)}>
                  <td><span className="expand-arrow">▶</span><strong>{b.name}</strong></td>
                  <td><span className="tag tag-blue">{b.courses?.name || '—'}</span></td>
                  <td style={{ fontFamily: 'var(--fm)', fontSize: '.78rem' }}>{b.year}</td>
                  <td className="c">{b.studentCount}</td>
                  <td style={{ fontFamily: 'var(--fm)', fontSize: '.76rem', color: 'var(--text2)' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
                {expanded === b.id && (
                  <tr><td colSpan={5} style={{ padding: 0, borderBottom: '2px solid var(--blue-dim)' }}>
                    <div className="expand-inner">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.6rem' }}>
                        <span style={{ fontSize: '.82rem', fontWeight: 700 }}>Students in <em>{b.name}</em></span>
                        <span style={{ fontFamily: 'var(--fm)', fontSize: '.68rem', color: 'var(--text3)' }}>{expandData.length} total</span>
                      </div>
                      {expandData.length === 0 ? (
                        <p style={{ fontFamily: 'var(--fm)', fontSize: '.76rem', color: 'var(--text3)' }}>No students in this batch yet.</p>
                      ) : (
                        <table>
                          <thead><tr><th>Roll No</th><th>Name</th><th>Phone</th></tr></thead>
                          <tbody>
                            {expandData.map(s => (
                              <tr key={s.id}>
                                <td style={{ fontFamily: 'var(--fm)', color: 'var(--blue)', fontWeight: 600 }}>{s.roll_no}</td>
                                <td style={{ fontWeight: 500 }}>{s.profiles?.full_name || '—'}</td>
                                <td style={{ fontFamily: 'var(--fm)', fontSize: '.74rem', color: 'var(--text2)' }}>
                                  {s.profiles?.phone || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal === 'create'} onClose={() => setModal(null)}>
        <h3>Create New Batch</h3>
        <p className="ms">A batch is linked to a course.</p>
        <div className="field"><label>Batch Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2025-A" /></div>
        <div className="field"><label>Course</label>
          <select value={form.course} onChange={e => setForm({ ...form, course: e.target.value })}>
            <option value="">— Select —</option>
            {Object.keys(COURSE_SUBJECTS).map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field"><label>Year</label><input type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} /></div>
        {err && <div className="err">{err}</div>}
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={handleCreate}>Create</button>
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}

