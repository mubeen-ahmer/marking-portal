import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';
import generatePassword from '../../utils/generatePassword';
import { createAuthUser } from '../../utils/createAuthUser';

const COURSE_SUBJECTS = {
  NUST: ['Physics','Math','Basic Math','Chemistry','English'],
  FAST: ['Math','Basic Math','IQ/Analytical Skills','English'],
  MDCAT: ['Biology','Chemistry','Physics','English','Logical Reasoning'],
  ECAT: ['Physics','Math','Chemistry','English'],
};

export default function Students() {
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [step, setStep] = useState(1);
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState({ name: '', batchId: '', phone: '' });
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [courseName, setCourseName] = useState('');
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdCreds, setCreatedCreds] = useState(null);
  const [subjectModal, setSubjectModal] = useState(null);
  const [subjectChips, setSubjectChips] = useState([]);
  const [subjectOrig, setSubjectOrig] = useState([]);
  const [transferModal, setTransferModal] = useState(false);
  const [trStudents, setTrStudents] = useState([]);
  const [trForm, setTrForm] = useState({ studentId: '', batchId: '' });
  const [trBatches, setTrBatches] = useState([]);
  const [resetModal, setResetModal] = useState(null);
  const [resetCreds, setResetCreds] = useState(null);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('students')
      .select('id, roll_no, created_at, profiles(full_name, phone), batches(id, name, courses(name))')
      .order('roll_no');
    setStudents(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadBatches = async () => {
    const { data } = await supabase.from('batches').select('id, name, courses(name)').order('name');
    setBatches(data || []);
  };

  const openAdd = async () => {
    setModal('add'); setStep(1); setForm({ name: '', batchId: '', phone: '' });
    setSelectedSubjects([]); setErr(''); setCreatedCreds(null);
    await loadBatches();
  };

  const nextStep = () => {
    if (!form.name || !form.batchId || !form.phone) { setErr('Fill all required fields (*)'); return; }
    setErr('');
    const batch = batches.find(b => b.id === form.batchId);
    const cn = batch?.courses?.name || '';
    setCourseName(cn);
    setSelectedSubjects([]);
    setStep(2);
  };

  const toggleSubject = (s) => {
    setSelectedSubjects(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const createStudent = async () => {
    setErr('');
    if (selectedSubjects.length === 0) { setErr('Select at least one subject'); return; }
    setCreating(true);
    try {
      const pw = generatePassword();
      const { data: rollData, error: rollErr } = await supabase.rpc('generate_roll', { p_batch_id: form.batchId });
      if (rollErr) throw rollErr;
      const rollNo = rollData;
      const loginEmail = `${rollNo.toLowerCase()}@student.local`;

      // Create auth user via isolated client (doesn't affect admin session)
      const userId = await createAuthUser(loginEmail, pw);

      // Create profile (as admin)
      await supabase.from('profiles').insert({
        id: userId, full_name: form.name, role: 'student', email: loginEmail, phone: form.phone || null,
      });

      // Confirm user email
      await supabase.rpc('confirm_user_email', { p_user_id: userId });

      const { error: enrollErr } = await supabase.rpc('enroll_student', { p_profile_id: userId, p_batch_id: form.batchId });
      if (enrollErr) throw enrollErr;

      const { data: subjects } = await supabase.from('subjects').select('id, name');
      for (const subjName of selectedSubjects) {
        const subjectId = subjects?.find(s => s.name === subjName)?.id;
        if (subjectId) await supabase.from('student_subjects').insert({ student_id: userId, subject_id: subjectId });
      }

      setCreatedCreds({ rollNo, password: pw, name: form.name, phone: form.phone });
      toast(`"${form.name}" created! Roll: ${rollNo}`);
      load();
    } catch (e) {
      setErr(e.message || 'Failed to create student');
    } finally {
      setCreating(false);
    }
  };

  const sendWhatsApp = (phone, roll, pw) => {
    if (!phone) { toast('No WhatsApp number', 'err'); return; }
    const clean = phone.replace(/\D/g, '');
    const msg = `*EduMark Student Login*\n\nRoll No: ${roll}\nPassword: ${pw}\n\nLogin at your student portal.`;
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const deleteStudent = async (id, name) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    const { error } = await supabase.rpc('delete_user_from_auth', { p_user_id: id });
    if (error) { toast(error.message, 'err'); return; }
    toast(`${name} deleted`); load();
  };

  const openResetPassword = (student) => {
    setResetModal({
      id: student.id,
      name: student.profiles?.full_name || '—',
      rollNo: student.roll_no,
      phone: student.profiles?.phone || null,
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
      setResetCreds({ rollNo: resetModal.rollNo, password: newPw, name: resetModal.name, phone: resetModal.phone });
      toast(`Password reset for ${resetModal.name}`);
    } catch (e) {
      toast(e.message || 'Failed to reset password', 'err');
    } finally {
      setResetting(false);
    }
  };

  const openSubjects = async (studentId, studentName, batchId, cn) => {
    setSubjectModal({ studentId, studentName, batchId });
    let cName = cn;
    if (!cName && batchId) {
      const { data: b } = await supabase.from('batches').select('courses(name)').eq('id', batchId).single();
      cName = b?.courses?.name || '';
    }
    const allSubjects = COURSE_SUBJECTS[cName] || [];
    const { data: enrolled } = await supabase.from('student_subjects').select('subjects(name)').eq('student_id', studentId);
    const enrolledNames = (enrolled || []).map(e => e.subjects?.name).filter(Boolean);
    setSubjectChips(allSubjects.map(s => ({ name: s, selected: enrolledNames.includes(s) })));
    setSubjectOrig(enrolledNames);
  };

  const saveSubjects = async () => {
    if (!subjectModal) return;
    const selected = subjectChips.filter(c => c.selected).map(c => c.name);
    const toAdd = selected.filter(s => !subjectOrig.includes(s));
    const toRemove = subjectOrig.filter(s => !selected.includes(s));
    const { data: subjects } = await supabase.from('subjects').select('id, name');
    for (const sn of toAdd) {
      const id = subjects?.find(s => s.name === sn)?.id;
      if (id) await supabase.from('student_subjects').insert({ student_id: subjectModal.studentId, subject_id: id });
    }
    for (const sn of toRemove) {
      const id = subjects?.find(s => s.name === sn)?.id;
      if (id) await supabase.from('student_subjects').delete().eq('student_id', subjectModal.studentId).eq('subject_id', id);
    }
    toast(`${toAdd.length} added, ${toRemove.length} removed`);
    setSubjectModal(null); load();
  };

  const openTransfer = async () => {
    setTransferModal(true); setTrForm({ studentId: '', batchId: '' });
    const { data: s } = await supabase.from('students').select('id, roll_no, batch_id, profiles(full_name), batches(course_id)').order('roll_no');
    setTrStudents(s || []);
  };

  const loadTrBatches = async (studentId) => {
    const st = trStudents.find(s => s.id === studentId);
    if (!st) return;
    const { data } = await supabase.from('batches').select('id, name').eq('course_id', st.batches?.course_id).order('name');
    setTrBatches((data || []).filter(b => b.id !== st.batch_id));
  };

  const doTransfer = async () => {
    if (!trForm.studentId || !trForm.batchId) { toast('Select student and batch', 'err'); return; }
    const { error } = await supabase.from('students').update({ batch_id: trForm.batchId }).eq('id', trForm.studentId);
    if (error) { toast(error.message, 'err'); return; }
    toast('Student transferred!'); setTransferModal(false); load();
  };

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  return (
    <div>
      <div className="pg-hd"><h2>Students</h2><p>Manage student accounts and subject enrollments</p></div>
      <div className="tbl-card">
        <div className="tbl-hd">
          <h3>All Students ({students.length})</h3>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center' }} onClick={openTransfer}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'.3rem'}}><path d="M17 3l4 4-4 4"></path><path d="M3 7h18"></path><path d="M7 21l-4-4 4-4"></path><path d="M21 17H3"></path></svg>
              Transfer
            </button>
            <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Student</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Roll No</th><th>Name</th><th>Phone</th><th>Batch</th><th>Course</th><th>Actions</th></tr></thead>
          <tbody>
            {students.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No students yet</td></tr>
            ) : students.map(s => (
              <tr key={s.id}>
                <td style={{ fontFamily: 'var(--fm)', color: 'var(--blue)', fontWeight: 600 }}>{s.roll_no}</td>
                <td style={{ fontWeight: 500 }}>{s.profiles?.full_name || '—'}</td>
                <td style={{ fontFamily: 'var(--fm)', fontSize: '.74rem', color: 'var(--text2)' }}>{s.profiles?.phone || '—'}</td>
                <td>{s.batches ? <span className="tag tag-blue">{s.batches.name}</span> : '—'}</td>
                <td>{s.batches?.courses?.name ? <span className="tag tag-purple">{s.batches.courses.name}</span> : '—'}</td>
                <td style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                  <button className="btn btn-outline btn-xs" onClick={() => openSubjects(s.id, s.profiles?.full_name, s.batches?.id, s.batches?.courses?.name)}>Subjects</button>
                  <button className="btn btn-outline btn-xs" style={{ display: 'flex', alignItems: 'center', color: 'var(--orange, #f59e0b)', borderColor: 'var(--orange, #f59e0b)' }} onClick={() => openResetPassword(s)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'.3rem'}}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
                    Reset
                  </button>
                  <button className="btn btn-danger btn-xs" style={{ display: 'flex', alignItems: 'center' }} onClick={() => deleteStudent(s.id, s.profiles?.full_name)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Student Modal */}
      <Modal open={modal === 'add'} onClose={() => setModal(null)}>
        {createdCreds ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              <h3 style={{ margin: 0 }}>Student Created!</h3>
            </div>
            <p className="ms">Save these credentials now — the password won't be shown again.</p>
            <div className="cred-box">
              <div className="cred-label">Roll Number</div>
              <div className="cred-value">{createdCreds.rollNo}</div>
            </div>
            <div className="cred-box">
              <div className="cred-label">Password</div>
              <div className="cred-value">{createdCreds.password}</div>
            </div>
            <div className="modal-foot">
              {createdCreds.phone && (
                <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', background: '#25d366' }}
                  onClick={() => sendWhatsApp(createdCreds.phone, createdCreds.rollNo, createdCreds.password)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'.4rem'}}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> 
                  Send via WhatsApp
                </button>
              )}
              <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center' }} onClick={() => { navigator.clipboard.writeText(`Roll: ${createdCreds.rollNo}\nPassword: ${createdCreds.password}`); toast('Copied!'); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'.4rem'}}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy
              </button>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        ) : step === 1 ? (
          <div>
            <h3>Add New Student</h3>
            <p className="ms">Password is auto-generated and shown once after creation.</p>
            <div className="field"><label>Full Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ahmed Khan" /></div>
            <div className="field"><label>Batch</label>
              <select value={form.batchId} onChange={e => setForm({ ...form, batchId: e.target.value })}>
                <option value="">— Select Batch —</option>
                {batches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.courses?.name || '?'})</option>)}
              </select>
            </div>
            <div className="field"><label>WhatsApp Number *</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="923001234567" /></div>
            {err && <div className="err">{err}</div>}
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={nextStep}>Next: Select Subjects →</button>
              <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <h3>Select Subjects</h3>
            <p className="ms">Choose subjects for {form.name} ({courseName}).</p>
            <div className="subj-chips">
              {(COURSE_SUBJECTS[courseName] || []).map(s => (
                <span key={s} className={`subj-chip ${selectedSubjects.includes(s) ? 'selected' : ''}`}
                  onClick={() => toggleSubject(s)}>{s} {selectedSubjects.includes(s) ? '✕' : ''}</span>
              ))}
            </div>
            {err && <div className="err" style={{ marginTop: '.6rem' }}>{err}</div>}
            <div className="modal-foot">
              <button className="btn btn-primary" onClick={createStudent} disabled={creating}>
                {creating ? <><span className="spin"></span> Creating…</> : 'Create Student'}
              </button>
              <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Subjects Modal */}
      <Modal open={!!subjectModal} onClose={() => setSubjectModal(null)}>
        <h3>Subjects: {subjectModal?.studentName}</h3>
        <p className="ms">Click to add · Click highlighted to remove</p>
        <div className="subj-chips">
          {subjectChips.map((c, i) => (
            <span key={c.name} className={`subj-chip ${c.selected ? 'selected' : ''}`}
              onClick={() => { const next = [...subjectChips]; next[i] = { ...c, selected: !c.selected }; setSubjectChips(next); }}>
              {c.name} {c.selected ? '✕' : ''}
            </span>
          ))}
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={saveSubjects}>Save Changes</button>
          <button className="btn btn-outline" onClick={() => setSubjectModal(null)}>Cancel</button>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal open={transferModal} onClose={() => setTransferModal(false)}>
        <h3>Transfer Student</h3>
        <p className="ms">Move a student to another batch of the same course.</p>
        <div className="field"><label>Student</label>
          <select value={trForm.studentId} onChange={e => { setTrForm({ ...trForm, studentId: e.target.value }); loadTrBatches(e.target.value); }}>
            <option value="">— Select —</option>
            {trStudents.map(s => <option key={s.id} value={s.id}>{s.profiles?.full_name || '?'} ({s.roll_no})</option>)}
          </select>
        </div>
        <div className="field"><label>New Batch</label>
          <select value={trForm.batchId} onChange={e => setTrForm({ ...trForm, batchId: e.target.value })}>
            <option value="">— Select —</option>
            {trBatches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={doTransfer}>Transfer</button>
          <button className="btn btn-outline" onClick={() => setTransferModal(false)}>Cancel</button>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={!!resetModal} onClose={() => setResetModal(null)}>
        {resetCreds ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              <h3 style={{ margin: 0 }}>Password Reset!</h3>
            </div>
            <p className="ms">New credentials for <strong>{resetCreds.name}</strong>. Save them now — the password won't be shown again.</p>
            <div className="cred-box">
              <div className="cred-label">Roll Number</div>
              <div className="cred-value">{resetCreds.rollNo}</div>
            </div>
            <div className="cred-box">
              <div className="cred-label">New Password</div>
              <div className="cred-value">{resetCreds.password}</div>
            </div>
            <div className="modal-foot">
              {resetCreds.phone && (
                <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', background: '#25d366' }}
                  onClick={() => sendWhatsApp(resetCreds.phone, resetCreds.rollNo, resetCreds.password)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'.4rem'}}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                  Send via WhatsApp
                </button>
              )}
              <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center' }} onClick={() => { navigator.clipboard.writeText(`Roll: ${resetCreds.rollNo}\nNew Password: ${resetCreds.password}`); toast('Copied!'); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'.4rem'}}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy
              </button>
              <button className="btn btn-outline" onClick={() => setResetModal(null)}>Close</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
              <h3 style={{ margin: 0 }}>Reset Password</h3>
            </div>
            <p className="ms">Generate a new password for <strong>{resetModal?.name}</strong> ({resetModal?.rollNo}).</p>
            <p style={{ color: 'var(--text2)', fontSize: '.82rem', margin: '.8rem 0' }}>
              This will immediately replace their current password. The student will need to use the new password to log in.
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
