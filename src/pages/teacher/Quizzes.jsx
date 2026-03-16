import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

// Parse CSV text into question rows
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { questions: [], errors: [] };

  // Detect and skip header row
  const firstLower = lines[0].toLowerCase();
  const hasHeader = firstLower.includes('question') || firstLower.includes('option') || firstLower.includes('correct');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const questions = [];
  const errors = [];

  dataLines.forEach((line, idx) => {
    const row = idx + (hasHeader ? 2 : 1); // 1-indexed line number
    // Parse CSV fields (handles quoted fields with commas inside)
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim()); current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    if (fields.length < 6) {
      errors.push(`Row ${row}: Expected 6 columns, got ${fields.length}`);
      return;
    }

    const [question_text, option_a, option_b, option_c, option_d, correct_raw] = fields;
    const correct_option = correct_raw.toLowerCase().trim();

    if (!question_text) { errors.push(`Row ${row}: Empty question text`); return; }
    if (!option_a || !option_b || !option_c || !option_d) { errors.push(`Row ${row}: Missing option(s)`); return; }
    if (!['a', 'b', 'c', 'd'].includes(correct_option)) {
      errors.push(`Row ${row}: Correct option must be a/b/c/d, got "${correct_raw}"`);
      return;
    }

    questions.push({ question_text, option_a, option_b, option_c, option_d, correct_option });
  });

  return { questions, errors };
}

export default function Quizzes() {
  const { profile } = useAuth();
  const toast = useToast();
  const [subjectId, setSubjectId] = useState(null);
  const [batches, setBatches] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [results, setResults] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [err, setErr] = useState('');
  const [csvData, setCsvData] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  const init = useCallback(async () => {
    if (!profile) return;
    const { data: ts } = await supabase.from('teacher_subjects').select('subject_id').eq('teacher_id', profile.id).maybeSingle();
    if (ts) setSubjectId(ts.subject_id);
    const { data: tbas } = await supabase.from('teacher_batch_assignments').select('batch_id, batches(id, name)').eq('teacher_id', profile.id);
    setBatches((tbas || []).map(t => t.batches).filter(Boolean));
    const { data: q } = await supabase.from('quizzes').select('*, batches(name)').eq('created_by', profile.id).order('created_at', { ascending: false });
    setQuizzes(q || []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { init(); }, [init]);

  const createQuiz = async () => {
    setErr('');
    const { title, batchId, timeLimit, maxAttempts, expiresAt } = form;
    if (!title || !batchId || !timeLimit || !maxAttempts || !expiresAt) { setErr('Fill all fields'); return; }
    
    const t = parseInt(timeLimit);
    const a = parseInt(maxAttempts);
    if (!t || t < 1) { setErr('Time limit must be at least 1 minute'); return; }
    if (!a || a < 1) { setErr('Max attempts must be at least 1'); return; }
    if (new Date(expiresAt) < new Date()) { setErr('Expiry date cannot be in the past'); return; }

    const expiresISO = new Date(expiresAt).toISOString();
    if (!subjectId) { setErr('Subject mapping error: No subject assigned to your profile.'); return; }

    const { data: quiz, error } = await supabase.from('quizzes').insert({
      title, batch_id: batchId, subject_id: subjectId,
      time_limit_mins: t, max_attempts: a,
      expires_at: expiresISO, created_by: profile.id,
    }).select().single();
    if (error) { setErr(error.message); return; }
    toast(`"${title}" created!`); setModal(null); init();
    showQuestions(quiz);
  };

  const showQuestions = async (quiz) => {
    setActiveQuiz(quiz); setView('questions');
    const { data } = await supabase.from('quiz_questions').select('*').eq('quiz_id', quiz.id).order('sort_order');
    setQuestions(data || []);
  };

  const addQuestion = async () => {
    setErr('');
    const { question_text, option_a, option_b, option_c, option_d, correct_option } = form;
    if (!question_text || !option_a || !option_b || !option_c || !option_d || !correct_option) { setErr('Fill all fields'); return; }
    const { error } = await supabase.from('quiz_questions').insert({
      quiz_id: activeQuiz.id, question_text, option_a, option_b, option_c, option_d, correct_option,
      sort_order: questions.length,
    });
    if (error) { setErr(error.message); return; }
    toast('Question added!'); setModal(null); showQuestions(activeQuiz);
  };

  // CSV Upload handlers
  const handleCSVFile = (file) => {
    if (!file || !file.name.endsWith('.csv')) { toast('Please select a .csv file', 'err'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseCSV(e.target.result);
      setCsvData({ ...result, fileName: file.name });
      setModal('csv-preview');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleCSVFile(file);
  };

  const importCSVQuestions = async () => {
    if (!csvData || csvData.questions.length === 0) return;
    setCsvUploading(true);
    try {
      const rows = csvData.questions.map((q, i) => ({
        quiz_id: activeQuiz.id, ...q, sort_order: questions.length + i,
      }));
      const { error } = await supabase.from('quiz_questions').insert(rows);
      if (error) throw error;
      toast(`${rows.length} questions imported!`);
      setModal(null); setCsvData(null); showQuestions(activeQuiz);
    } catch (e) {
      toast(e.message || 'Import failed', 'err');
    } finally {
      setCsvUploading(false);
    }
  };

  // Paste handler: Ctrl+V anywhere on the questions page
  useEffect(() => {
    if (view !== 'questions' || !activeQuiz) return;
    const handlePaste = (e) => {
      const text = e.clipboardData?.getData('text');
      if (!text || text.split(/\r?\n/).filter(l => l.trim()).length < 1) return;
      // Only parse if it looks like CSV (has commas)
      if (!text.includes(',')) return;
      e.preventDefault();
      const result = parseCSV(text);
      if (result.questions.length > 0) {
        setCsvData({ ...result, fileName: 'Pasted Data' });
        setModal('csv-preview');
      } else {
        toast('No valid questions found in pasted text', 'err');
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [view, activeQuiz, toast]);

  const deleteQuestion = async (id) => {
    if (!confirm('Delete this question?')) return;
    await supabase.from('quiz_questions').delete().eq('id', id);
    toast('Question deleted'); showQuestions(activeQuiz);
  };

  const deleteQuiz = async (id, title) => {
    if (!confirm(`Delete "${title}"? All questions and attempts will be deleted.`)) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', id);
    if (error) { toast(error.message, 'err'); return; }
    toast(`"${title}" deleted`); init();
  };

  const showResults = async (quiz) => {
    setActiveQuiz(quiz); setView('results');
    // Query attempts — join profiles for name
    const { data } = await supabase.from('quiz_attempts')
      .select('*, profiles:student_id(full_name)')
      .eq('quiz_id', quiz.id).eq('is_submitted', true).order('score', { ascending: false });

    // Deduplicate to keep only best score per student
    const bestAttempts = [];
    const seen = new Set();
    (data || []).forEach(att => {
      if (!seen.has(att.student_id)) {
        seen.add(att.student_id);
        bestAttempts.push(att);
      }
    });

    // Get roll numbers separately (students table FK is profile_id = id)
    const studentIds = [...seen];
    let rollMap = {};
    if (studentIds.length > 0) {
      const { data: studs } = await supabase.from('students').select('id, roll_no').in('id', studentIds);
      (studs || []).forEach(s => { rollMap[s.id] = s.roll_no; });
    }

    setResults(bestAttempts.map(r => ({ ...r, roll_no: rollMap[r.student_id] || '—' })));

    // Also load question count for this quiz (needed for assessment total_marks)
    const { count } = await supabase.from('quiz_questions').select('id', { count: 'exact', head: true }).eq('quiz_id', quiz.id);
    setActiveQuiz(prev => ({ ...prev, ...quiz, questionCount: count || 0 }));
  };

  const publishResults = async () => {
    if (!activeQuiz || activeQuiz.pushed_to_assessments) return;
    const isExpired = new Date(activeQuiz.expires_at) < new Date();
    if (!isExpired) { toast('Cannot publish results before quiz expires', 'err'); return; }
    if (results.length === 0) { toast('No submissions to publish', 'err'); return; }
    if (!confirm('Publish results? This will make scores visible to students and create an assessment with marks.')) return;

    try {
      // 1. Create assessment
      const totalMarks = activeQuiz.questionCount || results[0]?.total || 0;
      const { data: assess, error: aErr } = await supabase.from('assessments').insert({
        batch_id: activeQuiz.batch_id, subject_id: activeQuiz.subject_id,
        title: `Quiz: ${activeQuiz.title}`, total_marks: totalMarks, created_by: profile.id,
      }).select().single();
      if (aErr) throw aErr;

      // 2. Insert marks for each student
      const markRows = results.map(r => ({
        assessment_id: assess.id, student_id: r.student_id, obtained_marks: r.score,
      }));
      if (markRows.length > 0) {
        const { error: mErr } = await supabase.from('marks').insert(markRows);
        if (mErr) throw mErr;
      }

      // 3. Mark quiz as published
      await supabase.from('quizzes').update({ pushed_to_assessments: true }).eq('id', activeQuiz.id);

      toast(`Results published! Assessment created with ${markRows.length} scores.`);
      showResults({ ...activeQuiz, pushed_to_assessments: true });
    } catch (e) {
      toast(e.message || 'Failed to publish', 'err');
    }
  };

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  return (
    <div>
      {view === 'list' && (
        <>
          <div className="pg-hd"><h2>Quizzes</h2><p>Create and manage quizzes for your batches.</p></div>
          <div className="tbl-card">
            <div className="tbl-hd"><h3>My Quizzes ({quizzes.length})</h3>
              <button className="btn btn-primary btn-sm" onClick={() => {
                setForm({ title: '', batchId: '', timeLimit: '30', maxAttempts: '1', expiresAt: '' });
                setModal('create'); setErr('');
              }}>+ New Quiz</button>
            </div>
            <table><thead><tr><th>Title</th><th>Batch</th><th>Time</th><th>Expires</th><th>Published?</th><th>Actions</th></tr></thead>
              <tbody>
                {quizzes.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No quizzes yet</td></tr> :
                  quizzes.map(q => {
                    const isExpired = new Date(q.expires_at) < new Date();
                    return (
                    <tr key={q.id}>
                      <td style={{ fontWeight: 600 }}>{q.title}</td>
                      <td><span className="tag tag-blue">{q.batches?.name || '—'}</span></td>
                      <td style={{ fontFamily: 'var(--fm)', fontSize: '.78rem' }}>{q.time_limit_mins} min</td>
                      <td style={{ fontFamily: 'var(--fm)', fontSize: '.76rem' }}>
                        {isExpired ? <span className="tag tag-red">Expired</span> : new Date(q.expires_at).toLocaleString('en-US', { hour12: true })}
                      </td>
                      <td>{q.pushed_to_assessments ? <span className="tag tag-green">Published ✓</span> : <span className="tag tag-amber">Pending</span>}</td>
                      <td style={{ display: 'flex', gap: '.3rem' }}>
                        <button className="btn btn-outline btn-xs" onClick={() => showQuestions(q)}>Questions</button>
                        <button className="btn btn-outline btn-xs" onClick={() => showResults(q)}>Results</button>
                        <button className="btn btn-danger btn-xs" onClick={() => deleteQuiz(q.id, q.title)}>Del</button>
                      </td>
                    </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'questions' && (
        <>
          <div className="pg-hd">
            <button className="btn btn-outline btn-sm" style={{ marginBottom: '.6rem' }} onClick={() => { setView('list'); init(); }}>← Back to Quizzes</button>
            <h2>Questions — {activeQuiz?.title}</h2>
          </div>
          {/* CSV Drop Zone */}
          <div
            className={`csv-drop${dragging ? ' csv-drop-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => { handleCSVFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div style={{ fontSize: '2rem' }}>📄</div>
            <div style={{ fontWeight: 600 }}>Drop CSV here, click to browse, or paste (Ctrl+V)</div>
            <div style={{ fontSize: '.76rem', color: 'var(--text3)', marginTop: '.3rem' }}>
              Format: question, option_a, option_b, option_c, option_d, correct_option (a/b/c/d)
            </div>
          </div>

          {/* AI conversion tip */}
          <div style={{
            background: 'var(--blue-light)', border: '1px solid rgba(29,78,216,.15)', borderRadius: 'var(--r2)',
            padding: '.8rem 1rem', marginBottom: '1.2rem', fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.65,
          }}>
            <strong style={{ color: 'var(--blue)' }}>💡 Have a PDF or Word file?</strong> Copy the questions from it and give this prompt to any AI (ChatGPT, Gemini, etc.):
            <div style={{
              background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
              padding: '.5rem .7rem', marginTop: '.5rem', fontFamily: 'var(--fm)', fontSize: '.72rem',
              color: 'var(--text)', userSelect: 'all', cursor: 'text',
            }}>
              Convert the following questions into CSV format with these columns: question, option_a, option_b, option_c, option_d, correct_option (use a, b, c, or d). No header row. Output only the CSV, nothing else.
            </div>
            <div style={{ fontSize: '.7rem', color: 'var(--text3)', marginTop: '.35rem' }}>
              Then paste the AI's response here using <strong>Ctrl+V</strong>, or save it as a .csv file and drop it above.
            </div>
          </div>

          <div className="tbl-card">
            <div className="tbl-hd"><h3>{questions.length} Questions</h3>
              <button className="btn btn-primary btn-sm" onClick={() => {
                setForm({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: '' });
                setModal('question'); setErr('');
              }}>+ Add Question</button>
            </div>
            {questions.length === 0 ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)' }}>No questions yet</div> :
              <div style={{ padding: '1rem' }}>
                {questions.map((q, i) => (
                  <div key={q.id} style={{ background: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--r2)', padding: '1rem', marginBottom: '.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                      <strong>Q{i + 1}. {q.question_text}</strong>
                      <button className="btn btn-danger btn-xs" onClick={() => deleteQuestion(q.id)}>✕</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem', fontSize: '.82rem' }}>
                      {['a', 'b', 'c', 'd'].map(opt => (
                        <div key={opt} style={{ padding: '.4rem .6rem', borderRadius: 'var(--r)', background: q.correct_option === opt ? 'var(--green-bg)' : 'var(--white)', border: `1px solid ${q.correct_option === opt ? 'var(--green)' : 'var(--border)'}`, color: q.correct_option === opt ? 'var(--green)' : 'var(--text)' }}>
                          <strong>{opt.toUpperCase()}.</strong> {q[`option_${opt}`]}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>
        </>
      )}

      {view === 'results' && (
        <>
          <div className="pg-hd">
            <button className="btn btn-outline btn-sm" style={{ marginBottom: '.6rem' }} onClick={() => { setView('list'); init(); }}>← Back to Quizzes</button>
            <h2>Results — {activeQuiz?.title}</h2>
          </div>
          <div className="tbl-card">
            <div className="tbl-hd"><h3>{results.length} Submissions</h3>
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                {activeQuiz?.pushed_to_assessments ? (
                  <span className="tag tag-green">✓ Published — Assessment created</span>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={publishResults}
                    disabled={new Date(activeQuiz?.expires_at) > new Date() || results.length === 0}
                    title={new Date(activeQuiz?.expires_at) > new Date() ? 'Wait for quiz to expire' : ''}>
                    📢 Publish Results
                  </button>
                )}
              </div>
            </div>
            {!activeQuiz?.pushed_to_assessments && new Date(activeQuiz?.expires_at) > new Date() && (
              <div style={{ padding: '.6rem 1.2rem', background: 'var(--amber-bg)', borderBottom: '1px solid var(--border)', fontSize: '.78rem', color: 'var(--amber)' }}>
                ⏳ Results can be published after the quiz expires ({new Date(activeQuiz?.expires_at).toLocaleString()})
              </div>
            )}
            <table><thead><tr><th>Roll No</th><th>Name</th><th className="c">Score</th><th className="c">Total</th><th className="c">%</th><th className="c">Violations</th><th>Submitted</th></tr></thead>
              <tbody>
                {results.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No submissions yet</td></tr> :
                  results.map(r => {
                    const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
                    return (
                      <tr key={r.id}>
                        <td style={{ fontFamily: 'var(--fm)', color: 'var(--blue)', fontWeight: 600 }}>{r.roll_no}</td>
                        <td style={{ fontWeight: 500 }}>{r.profiles?.full_name || '—'}</td>
                        <td className="c" style={{ fontFamily: 'var(--fm)', fontWeight: 700 }}>{r.score}</td>
                        <td className="c" style={{ fontFamily: 'var(--fm)' }}>{r.total}</td>
                        <td className="c"><span className={`pill ${pct >= 70 ? 'pill-pass' : pct >= 40 ? 'pill-avg' : 'pill-fail'}`}>{pct}%</span></td>
                        <td className="c" style={{ fontFamily: 'var(--fm)', fontSize: '.76rem', color: r.violations > 0 ? 'var(--red)' : 'var(--text3)' }}>
                          {r.violations || 0}{r.violations > 0 ? ' ⚠' : ''}
                        </td>
                        <td style={{ fontFamily: 'var(--fm)', fontSize: '.76rem' }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'}</td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create Quiz Modal */}
      <Modal open={modal === 'create'} onClose={() => setModal(null)}>
        <h3>New Quiz</h3>
        <div className="field"><label>Title</label><input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chapter 3 Quiz" /></div>
        <div className="field"><label>Batch</label>
          <select value={form.batchId || ''} onChange={e => setForm({ ...form, batchId: e.target.value })}>
            <option value="">— Select —</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Time Limit (mins)</label><input type="number" min="1" onWheel={(e) => e.target.blur()} value={form.timeLimit || ''} onChange={e => setForm({ ...form, timeLimit: e.target.value })} /></div>
        <div className="field"><label>Max Attempts</label><input type="number" min="1" onWheel={(e) => e.target.blur()} value={form.maxAttempts || ''} onChange={e => setForm({ ...form, maxAttempts: e.target.value })} /></div>
        <div className="field"><label>Expires At</label><input type="datetime-local" value={form.expiresAt || ''} onChange={e => setForm({ ...form, expiresAt: e.target.value })} /></div>
        {err && <div className="err">{err}</div>}
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={createQuiz}>Create Quiz</button>
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
        </div>
      </Modal>

      {/* Add Question Modal */}
      <Modal open={modal === 'question'} onClose={() => setModal(null)}>
        <h3>Add Question</h3>
        <div className="field"><label>Question</label><textarea value={form.question_text || ''} onChange={e => setForm({ ...form, question_text: e.target.value })} placeholder="Question text" /></div>
        <div className="field"><label>Option A</label><input value={form.option_a || ''} onChange={e => setForm({ ...form, option_a: e.target.value })} /></div>
        <div className="field"><label>Option B</label><input value={form.option_b || ''} onChange={e => setForm({ ...form, option_b: e.target.value })} /></div>
        <div className="field"><label>Option C</label><input value={form.option_c || ''} onChange={e => setForm({ ...form, option_c: e.target.value })} /></div>
        <div className="field"><label>Option D</label><input value={form.option_d || ''} onChange={e => setForm({ ...form, option_d: e.target.value })} /></div>
        <div className="field"><label>Correct Option</label>
          <select value={form.correct_option || ''} onChange={e => setForm({ ...form, correct_option: e.target.value })}>
            <option value="">— Select —</option>
            <option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option>
          </select>
        </div>
        {err && <div className="err">{err}</div>}
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={addQuestion}>Add</button>
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
        </div>
      </Modal>

      {/* CSV Preview Modal */}
      <Modal open={modal === 'csv-preview'} onClose={() => { setModal(null); setCsvData(null); }}>
        <h3>📄 CSV Preview — {csvData?.fileName}</h3>
        {csvData?.errors?.length > 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--r)', padding: '.6rem .8rem', marginBottom: '.8rem', fontSize: '.78rem', color: 'var(--red)' }}>
            <strong>⚠ {csvData.errors.length} error(s):</strong>
            <ul style={{ margin: '.3rem 0 0 1rem', padding: 0 }}>
              {csvData.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
        {csvData?.questions?.length > 0 ? (
          <>
            <p className="ms" style={{ marginBottom: '.6rem' }}>{csvData.questions.length} question(s) ready to import:</p>
            <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              {csvData.questions.map((q, i) => (
                <div key={i} style={{ padding: '.6rem .8rem', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
                  <strong>Q{i + 1}.</strong> {q.question_text}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem', marginTop: '.3rem', fontSize: '.76rem' }}>
                    {['a', 'b', 'c', 'd'].map(opt => (
                      <span key={opt} style={{ padding: '.2rem .4rem', borderRadius: 'var(--r)', background: q.correct_option === opt ? '#dcfce7' : 'var(--surf)', border: `1px solid ${q.correct_option === opt ? 'var(--green)' : 'var(--border)'}` }}>
                        <strong>{opt.toUpperCase()}.</strong> {q[`option_${opt}`]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-foot" style={{ marginTop: '.8rem' }}>
              <button className="btn btn-primary" onClick={importCSVQuestions} disabled={csvUploading}>
                {csvUploading ? <><span className="spin"></span> Importing…</> : `Import ${csvData.questions.length} Questions`}
              </button>
              <button className="btn btn-outline" onClick={() => { setModal(null); setCsvData(null); }}>Cancel</button>
            </div>
          </>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)' }}>
            No valid questions found. Check your CSV format.
          </div>
        )}
      </Modal>
    </div>
  );
}
