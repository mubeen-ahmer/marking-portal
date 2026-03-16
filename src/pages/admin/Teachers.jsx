import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import generatePassword from '../../utils/generatePassword';
import { createAuthUser } from '../../utils/createAuthUser';

const ALL_SUBJECTS = ['Physics','Math','Basic Math','Chemistry','Biology','English','IQ/Analytical Skills','Logical Reasoning'];

export default function Teachers() {
  const toast = useToast();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '' });
  const [err, setErr] = useState('');
  const [createdCreds, setCreatedCreds] = useState(null);
  const [batchModal, setBatchModal] = useState(null);
  const [batchChips, setBatchChips] = useState([]);
  const [batchOrig, setBatchOrig] = useState([]);
  const [resetModal, setResetModal] = useState(null);
  const [resetCreds, setResetCreds] = useState(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('id, full_name, phone, email, created_at').eq('role', 'teacher').order('created_at');
    const enriched = await Promise.all((data || []).map(async t => {
      const { data: ts } = await supabase.from('teacher_subjects').select('subjects(name)').eq('teacher_id', t.id).maybeSingle();
      const { data: tbas } = await supabase.from('teacher_batch_assignments').select('batches(name)').eq('teacher_id', t.id);
      return { ...t, subjectName: ts?.subjects?.name || null, batchNames: (tbas || []).map(a => a.batches?.name).filter(Boolean) };
    }));
    setTeachers(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setErr('');
    if (!form.name || !form.email || !form.subject) { setErr('Fill all required fields'); return; }
    try {
      const pw = generatePassword();
      const { data: subjects } = await supabase.from('subjects').select('id, name');
      const subjectId = subjects?.find(s => s.name === form.subject)?.id;
      if (!subjectId) { setErr('Subject not found in DB'); return; }

      // Create auth user via isolated client (doesn't affect admin session)
      const userId = await createAuthUser(form.email, pw);

      // Create profile (as admin)
      await supabase.from('profiles').insert({
        id: userId, full_name: form.name, role: 'teacher', email: form.email, phone: form.phone || null,
      });

      await supabase.rpc('confirm_user_email', { p_user_id: userId });

      const { error: subjErr } = await supabase.from('teacher_subjects').insert({ teacher_id: userId, subject_id: subjectId });
      if (subjErr) throw subjErr;

      setCreatedCreds({ name: form.name, email: form.email, password: pw, phone: form.phone });
      toast(`"${form.name}" created!`); load();
    } catch (e) { setErr(e.message || 'Failed to create teacher'); }
  };

  const sendWhatsApp = (phone, email, pw) => {
    if (!phone) { toast('No WhatsApp number', 'err'); return; }
    const clean = phone.replace(/\D/g, '');
    const msg = `*EduMark Teacher Login*\n\nEmail: ${email}\nPassword: ${pw}\n\nLogin at your teacher portal.`;
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const deleteTeacher = async (id, name) => {
    if (!confirm(`Delete ${name}?`)) return;
    const { error } = await supabase.rpc('delete_user_from_auth', { p_user_id: id });
    if (error) { toast(error.message, 'err'); return; }
    toast(`${name} deleted`); load();
  };

  const openResetPassword = (teacher) => {
    setResetModal({
      id: teacher.id,
      name: teacher.full_name,
      email: teacher.email || '—',
      phone: teacher.phone || null,
    });
    setResetCreds(null);
  };

  const doResetPassword = async () => {
    if (!resetModal) return;
    setResetting(true);
    try {
      const newPw = generatePassword();
      const { error } = await supabase.rpc('admin_reset_password', {
        p_user_id: resetModal.id,
        p_new_password: newPw,
      });
      if (error) throw error;
      setResetCreds({ email: resetModal.email, password: newPw, name: resetModal.name, phone: resetModal.phone });
      toast(`Password reset for ${resetModal.name}`);
    } catch (e) {
      toast(e.message || 'Failed to reset password', 'err');
    } finally {
      setResetting(false);
    }
  };

  const openBatches = async (teacherId, teacherName) => {
    setBatchModal({ teacherId, teacherName });
    const { data: ts } = await supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', teacherId).maybeSingle();
    let validCourseIds = [];
    if (ts?.subject_id) {
      const { data: cs } = await supabase.from('course_subjects').select('course_id').eq('subject_id', ts.subject_id);
      validCourseIds = (cs || []).map(c => c.course_id);
    }
    let allBatches = [];
    if (validCourseIds.length > 0) {
      const { data: b } = await supabase.from('batches').select('id, name, courses(name)').in('course_id', validCourseIds).order('name');
      allBatches = b || [];
    }
    const { data: assigned } = await supabase.from('teacher_batch_assignments').select('batch_id').eq('teacher_id', teacherId);
    const assignedIds = (assigned || []).map(a => a.batch_id);
    setBatchChips(allBatches.map(b => ({ id: b.id, name: `${b.name} (${b.courses?.name || '?'})`, selected: assignedIds.includes(b.id) })));
    setBatchOrig(assignedIds);
  };

  const saveBatches = async () => {
    if (!batchModal) return;
    const selected = batchChips.filter(c => c.selected).map(c => c.id);
    const toAdd = selected.filter(id => !batchOrig.includes(id));
    const toRemove = batchOrig.filter(id => !selected.includes(id));
    for (const batchId of toAdd) await supabase.from('teacher_batch_assignments').insert({ teacher_id: batchModal.teacherId, batch_id: batchId });
    for (const batchId of toRemove) await supabase.from('teacher_batch_assignments').delete().eq('teacher_id', batchModal.teacherId).eq('batch_id', batchId);
    toast(`Batches: ${toAdd.length} added, ${toRemove.length} removed`);
    setBatchModal(null); load();
  };

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  return (
    <div>
      <div className="pg-hd"><h2>Teachers</h2><p>Each teacher has one permanent subject. Multiple batches can be assigned.</p></div>
      <div className="tbl-card">
        <div className="tbl-hd">
          <h3>All Teachers ({teachers.length})</h3>
          <button className="btn btn-primary btn-sm" onClick={() => { setModal('add'); setForm({ name: '', email: '', phone: '', subject: '' }); setErr(''); setCreatedCreds(null); }}>+ Add Teacher</button>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Subject (locked)</th><th>Assigned Batches</th><th>Email</th><th>Phone</th><th>Actions</th></tr></thead>
          <tbody>
            {teachers.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No teachers yet</td></tr>
            ) : teachers.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.full_name}</td>
                <td>{t.subjectName ? <span className="lock-badge">🔒 {t.subjectName}</span> : <span style={{ color: 'var(--text3)', fontSize: '.72rem' }}>Not set</span>}</td>
                <td>{t.batchNames.length > 0 ? t.batchNames.map((n, i) => <span key={i} className="tag tag-blue" style={{ marginRight: '.3rem' }}>{n}</span>) : <span style={{ color: 'var(--text3)', fontSize: '.76rem' }}>None</span>}</td>
                <td style={{ fontFamily: 'var(--fm)', fontSize: '.74rem', color: 'var(--text2)' }}>{t.email || '—'}</td>
                <td style={{ fontFamily: 'var(--fm)', fontSize: '.74rem', color: 'var(--text2)' }}>{t.phone || '—'}</td>
                <td style={{ display: 'flex', gap: '.3rem' }}>
                  <button className="btn btn-outline btn-xs" onClick={() => openBatches(t.id, t.full_name)}>Batches</button>
                  <button className="btn btn-outline btn-xs" style={{ color: 'var(--orange, #f59e0b)', borderColor: 'var(--orange, #f59e0b)' }} onClick={() => openResetPassword(t)}>🔑 Reset</button>
                  <button className="btn btn-danger btn-xs" onClick={() => deleteTeacher(t.id, t.full_name)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modal === 'add'} onClose={() => setModal(null)}>
        {createdCreds ? (
          <div>
            <h3>✅ Teacher Created!</h3>
            <p className="ms">Save these credentials now — the password won't be shown again.</p>
            <div className="cred-box"><div className="cred-label">Email</div><div className="cred-value">{createdCreds.email}</div></div>
            <div className="cred-box"><div className="cred-label">Password</div><div className="cred-value">{createdCreds.password}</div></div>
            <div className="modal-foot">
              {createdCreds.phone && <button className="btn btn-primary" style={{ background: '#25d366' }} onClick={() => sendWhatsApp(createdCreds.phone, createdCreds.email, createdCreds.password)}>📲 Send via WhatsApp</button>}
              <button className="btn btn-outline" onClick={() => { navigator.clipboard.writeText(`Email: ${createdCreds.email}\nPassword: ${createdCreds.password}`); toast('Copied!'); }}>📋 Copy</button>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        ) : (
          <div>
            <h3>Add New Teacher</h3>
            <p className="ms">Subject is <strong>permanent</strong>. Password is auto-generated and shown once.</p>
            <div className="field"><label>Full Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Dr. Ayesha Khan" /></div>
            <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="teacher@example.com" /></div>
            <div className="field"><label>WhatsApp Number</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="923001234567" /></div>
            <div className="field"><label>Subject (permanent)</label>
              <select value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}>
                <option value="">— Select —</option>
                {ALL_SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            {err && <div className="err">{err}</div>}
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={handleCreate}>Create Teacher</button>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!batchModal} onClose={() => setBatchModal(null)}>
        <h3>Batches: {batchModal?.teacherName}</h3>
        <p className="ms">Only batches whose course includes this teacher's subject are shown.</p>
        <div className="subj-chips">
          {batchChips.length === 0 ? <span style={{ fontFamily: 'var(--fm)', fontSize: '.74rem', color: 'var(--text3)' }}>No batches available.</span> :
            batchChips.map((c, i) => (
              <span key={c.id} className={`subj-chip ${c.selected ? 'selected' : ''}`}
                onClick={() => { const next = [...batchChips]; next[i] = { ...c, selected: !c.selected }; setBatchChips(next); }}>
                {c.name} {c.selected ? '✕' : ''}
              </span>
            ))
          }
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={saveBatches}>Save</button>
          <button className="btn btn-outline" onClick={() => setBatchModal(null)}>Cancel</button>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetModal} onClose={() => setResetModal(null)}>
        {resetCreds ? (
          <div>
            <h3>🔑 Password Reset!</h3>
            <p className="ms">New credentials for <strong>{resetCreds.name}</strong>. Save them now — the password won't be shown again.</p>
            <div className="cred-box"><div className="cred-label">Email</div><div className="cred-value">{resetCreds.email}</div></div>
            <div className="cred-box"><div className="cred-label">New Password</div><div className="cred-value">{resetCreds.password}</div></div>
            <div className="modal-foot">
              {resetCreds.phone && (
                <button className="btn btn-primary" style={{ background: '#25d366' }}
                  onClick={() => sendWhatsApp(resetCreds.phone, resetCreds.email, resetCreds.password)}>
                  📲 Send via WhatsApp
                </button>
              )}
              <button className="btn btn-outline" onClick={() => { navigator.clipboard.writeText(`Email: ${resetCreds.email}\nNew Password: ${resetCreds.password}`); toast('Copied!'); }}>📋 Copy</button>
              <button className="btn btn-outline" onClick={() => setResetModal(null)}>Close</button>
            </div>
          </div>
        ) : (
          <div>
            <h3>🔑 Reset Password</h3>
            <p className="ms">Generate a new password for <strong>{resetModal?.name}</strong> ({resetModal?.email}).</p>
            <p style={{ color: 'var(--text2)', fontSize: '.82rem', margin: '.8rem 0' }}>
              This will immediately replace their current password. The teacher will need to use the new password to log in.
            </p>
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={doResetPassword} disabled={resetting}>
                {resetting ? <><span className="spin"></span> Resetting…</> : 'Reset Password'}
              </button>
              <button className="btn btn-outline" onClick={() => setResetModal(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
