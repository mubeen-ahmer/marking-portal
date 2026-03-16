import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';

// Fisher-Yates shuffle (deterministic per-student via seed)
function shuffleArray(arr, seed) {
  const shuffled = [...arr];
  let m = shuffled.length, t, i, s = seed;
  while (m) {
    s = (s * 9301 + 49297) % 233280;
    i = Math.floor((s / 233280) * m--);
    t = shuffled[m]; shuffled[m] = shuffled[i]; shuffled[i] = t;
  }
  return shuffled;
}

function uuidToSeed(uuid) {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash) + uuid.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function TakeQuiz() {
  const { quizId } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [secsLeft, setSecsLeft] = useState(0);
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFsPrompt, setShowFsPrompt] = useState(false);
  const [submitModalMsg, setSubmitModalMsg] = useState(null);
  const [violationSubmitted, setViolationSubmitted] = useState(false);
  const [subjectName, setSubjectName] = useState('');

  const timerRef = useRef(null);
  const autoSaveRef = useRef(null);
  const submittingRef = useRef(false);
  const serverOffsetRef = useRef(0); // ms offset: serverTime - clientTime
  const questionRefs = useRef({});

  // Auto-save answers to DB
  const saveAnswers = useCallback(async (attemptId, currentAnswers) => {
    const rows = Object.entries(currentAnswers).map(([qid, opt]) => ({
      attempt_id: attemptId, question_id: qid, selected_option: opt,
    }));
    if (rows.length > 0) {
      await supabase.from('quiz_answers').upsert(rows, {
        onConflict: 'attempt_id,question_id',
      });
    }
  }, []);

  // Submit quiz
  const submitQuiz = useCallback(async (attemptId) => {
    if (submittingRef.current || submitted) return;
    submittingRef.current = true;
    setSubmitted(true);
    clearInterval(timerRef.current);
    clearInterval(autoSaveRef.current);

    try {
      await saveAnswers(attemptId, answers);
      const { data, error: rpcErr } = await supabase.rpc('submit_quiz', { p_attempt_id: attemptId });
      if (rpcErr) throw rpcErr;
      setResult(data);
      toast('Quiz submitted!');
      exitFullscreen();
    } catch (e) {
      toast(e.message || 'Failed to submit quiz', 'err');
      submittingRef.current = false;
      setSubmitted(false);
    }
  }, [answers, submitted, toast, saveAnswers]);

  // Fullscreen helpers
  const enterFullscreen = () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      setIsFullscreen(true);
    } catch { /* some browsers block */ }
  };

  const exitFullscreen = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
    } catch { /* ignore */ }
  };

  // Load quiz
  useEffect(() => {
    if (!profile || !quizId) return;
    (async () => {
      try {
        // Get server time to compute offset (anti-clock-manipulation)
        const { data: serverTime } = await supabase.rpc('get_server_time');
        if (serverTime) {
          serverOffsetRef.current = new Date(serverTime).getTime() - Date.now();
        }

        const { data: q, error: qErr } = await supabase.from('quizzes').select('*, subjects(name)').eq('id', quizId).single();
        if (qErr) throw qErr;
        setQuiz(q);
        if (q.subjects) setSubjectName(q.subjects.name);

        // Start/resume attempt via secure RPC FIRST (so RLS allows question fetching)
        const { data: attData, error: attErr } = await supabase.rpc('start_quiz_attempt', { p_quiz_id: quizId });
        if (attErr) throw attErr;

        // Load questions from secure RPC (requires active attempt)
        const { data: qs, error: qsErr } = await supabase.rpc('get_student_quiz_questions', { p_quiz_id: quizId });
        if (qsErr) throw qsErr;

        const seed = uuidToSeed(profile.id + quizId);
        setQuestions(shuffleArray(qs || [], seed));

        // Handle auto-submitted expired attempts
        if (attData.auto_submitted) {
          setSubmitted(true);
          setResult({ score: attData.score, total: attData.total });
          setAttempt(attData);
          setViolations(attData.violations || 0);
          setLoading(false);
          return;
        }

        setAttempt(attData);

        // Restore answers on resume
        if (attData.resumed) {
          const { data: existingAnswers } = await supabase.from('quiz_answers')
            .select('question_id, selected_option').eq('attempt_id', attData.id);
          if (existingAnswers) {
            const restored = {};
            existingAnswers.forEach(a => { restored[a.question_id] = a.selected_option; });
            setAnswers(restored);
          }
        }

        setViolations(attData.violations || 0);

        // Calculate remaining time using server-calibrated time
        const startedAt = new Date(attData.started_at).getTime();
        const nowServer = Date.now() + serverOffsetRef.current;
        const elapsed = (nowServer - startedAt) / 1000;
        const remaining = Math.max(0, q.time_limit_mins * 60 - Math.floor(elapsed));
        setSecsLeft(remaining);

        if (remaining <= 0) {
          setSubmitted(true);
          const { data: r } = await supabase.rpc('submit_quiz', { p_attempt_id: attData.id });
          setResult(r);
        } else {
          // Show fullscreen prompt for new attempts
          setShowFsPrompt(true);
        }

        setLoading(false);
      } catch (e) {
        setError(e.message || 'Failed to load quiz');
        setLoading(false);
      }
    })();
  }, [profile, quizId]);

  // Timer (uses server offset)
  useEffect(() => {
    if (loading || submitted || !attempt) return;
    timerRef.current = setInterval(() => {
      setSecsLeft(prev => {
        if (prev <= 1) { submitQuiz(attempt.id); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [loading, submitted, attempt, submitQuiz]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (loading || submitted || !attempt) return;
    autoSaveRef.current = setInterval(() => {
      saveAnswers(attempt.id, answers).catch(() => {});
    }, 30000);
    return () => clearInterval(autoSaveRef.current);
  }, [loading, submitted, attempt, answers, saveAnswers]);

  // Anti-cheat listeners
  useEffect(() => {
    if (loading || submitted || !attempt) return;

    const recordViolation = async () => {
      if (submittingRef.current || submitted) return;
      setViolations(v => v + 1);
      
      // Submit immediately on first violation
      try {
        await supabase.rpc('record_violation', { p_attempt_id: attempt.id });
        await saveAnswers(attempt.id, answers);
        const { data } = await supabase.rpc('submit_quiz', { p_attempt_id: attempt.id });
        
        setSubmitted(true);
        setResult(data);
        setViolationSubmitted(true);
        clearInterval(timerRef.current);
        clearInterval(autoSaveRef.current);
        exitFullscreen();
      } catch (e) {
        console.error(e);
      }
    };

    const handleVisibility = () => { if (document.hidden) recordViolation(); };
    const handleBlur = () => {
      // Adding a tiny delay prevents false positives from browser auto-fill or system popups
      setTimeout(() => { if (!document.hasFocus()) recordViolation(); }, 200);
    };
    const handleContextMenu = (e) => e.preventDefault();
    const handleCopy = (e) => { e.preventDefault(); recordViolation(); };
    const handleBeforePrint = () => recordViolation();
    const handleKeyDown = (e) => {
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
      if (e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'i' || e.key === 'j')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U'))) {
        e.preventDefault();
        recordViolation();
      }
    };

    // Fullscreen exit detection
    const handleFsChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        setIsFullscreen(false);
        if (!submitted) recordViolation();
      } else {
        setIsFullscreen(true);
      }
    };

    // Prevent leaving page
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeprint', handleBeforePrint);
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeprint', handleBeforePrint);
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [loading, submitted, attempt]);

  const handleAnswer = (questionId, option) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  };

  const toggleFlag = (questionId) => {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const scrollToQuestion = (idx) => {
    const qId = questions[idx]?.id;
    if (qId && questionRefs.current[qId]) {
      questionRefs.current[qId].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const requestSubmit = () => {
    const unanswered = questions.length - Object.keys(answers).length;
    const flaggedCount = flagged.size;
    let msg = 'Submit quiz? You cannot change your answers after this.';
    if (unanswered > 0) msg = `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}.` + (flaggedCount > 0 ? ` ${flaggedCount} flagged for review.` : '') + ' Submit anyway?';
    else if (flaggedCount > 0) msg = `You have ${flaggedCount} question${flaggedCount > 1 ? 's' : ''} flagged for review. Submit anyway?`;
    
    setSubmitModalMsg(msg);
  };

  const confirmSubmit = () => {
    setSubmitModalMsg(null);
    submitQuiz(attempt.id);
  };

  if (loading) return <div className="loading"><span className="spin"></span> Loading quiz...</div>;

  // Error screen
  if (error) {
    return (
      <div>
        <div className="pg-hd"><h2>Quiz Error</h2></div>
        <div className="pw-box" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>!</div>
          <p style={{ color: 'var(--red)', fontWeight: 600, marginBottom: '.5rem' }}>{error}</p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }}
            onClick={() => navigate('/student/quizzes')}>Back to Quizzes</button>
        </div>
      </div>
    );
  }

  // Result screen - score hidden until teacher publishes
  if (submitted) {
    return (
      <div>
        <div className="pg-hd"><h2>Quiz Submitted</h2></div>
        <div className="pw-box" style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '.8rem' }}>*</div>
          <h3 style={{ marginBottom: '.5rem' }}>{quiz?.title}</h3>
          <p style={{ color: 'var(--text2)', fontSize: '.88rem', lineHeight: 1.6, margin: '.8rem 0' }}>
            {violationSubmitted ? (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}>Your quiz was automatically submitted due to a rule violation (e.g. exiting full screen, switching tabs, etc).</span>
            ) : (
              <>Your quiz has been submitted successfully.<br />
              Results will be available once your teacher publishes them.</>
            )}
          </p>
          <button className="btn btn-primary" style={{ marginTop: '1.5rem' }}
            onClick={() => navigate('/student/quizzes')}>Back to Quizzes</button>
        </div>
      </div>
    );
  }

  const mins = Math.floor(secsLeft / 60);
  const secs = Math.floor(secsLeft % 60);
  const answered = Object.keys(answers).length;
  const isLowTime = secsLeft < 60;

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Fullscreen prompt */}
      {showFsPrompt && (
        <div className="quiz-fs-prompt">
          <div className="quiz-fs-box">
            <div style={{ fontSize: '2.5rem', marginBottom: '.8rem', color: 'var(--blue)' }}>⛶</div>
            <h3 style={{ marginBottom: '.5rem' }}>Start Quiz</h3>
            <p style={{ color: 'var(--text2)', fontSize: '.88rem', marginBottom: '1.2rem', lineHeight: 1.6 }}>
              This quiz must be taken in full-screen mode.<br /><br />
              <strong style={{ color: 'var(--red)' }}>WARNING:</strong> Switching tabs, minimizing, or exiting full screen will result in an <strong>immediate automatic submission</strong>.
            </p>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
              <button className="btn btn-primary" style={{ padding: '.8rem 2rem', fontSize: '1rem' }} onClick={() => { enterFullscreen(); setShowFsPrompt(false); }}>
                Enter Full-Screen & Start
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Submit Confirm Modal */}
      {submitModalMsg && (
        <div className="quiz-fs-prompt" style={{ zIndex: 9999 }}>
          <div className="quiz-fs-box" style={{ maxWidth: 400 }}>
            <h3 style={{ marginBottom: '1rem' }}>Submit Quiz?</h3>
            <p style={{ color: 'var(--text2)', fontSize: '.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              {submitModalMsg}
            </p>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={confirmSubmit}>Yes, Submit</button>
              <button className="btn btn-outline" onClick={() => setSubmitModalMsg(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Violation warning overlay */}
      {warning && (
        <div className="quiz-warn-overlay">
          <div style={{ fontSize: '4rem' }}>!</div>
          <h2 style={{ color: '#fff', fontSize: '1.5rem' }}>Violation Detected!</h2>
          <p style={{ color: 'rgba(255,255,255,.7)', maxWidth: 400 }}>This incident has been recorded on the server.</p>
        </div>
      )}

      {/* Sticky header with timer + progress dots */}
      <div className="quiz-sticky-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.2rem' }}>
              {subjectName || 'Subject'}
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{quiz?.title}</h2>
            <div style={{ fontFamily: 'var(--fm)', fontSize: '.75rem', color: 'var(--text2)', marginTop: '.3rem' }}>
              {answered}/{questions.length} answered
              {flagged.size > 0 && <> | <span style={{ color: 'var(--amber)' }}>Flagged: {flagged.size}</span></>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.5rem' }}>
            <div className={`quiz-timer ${isLowTime ? 'quiz-timer-low' : ''}`} style={{ fontSize: '1.5rem', padding: '.4rem .8rem' }}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </div>
            <button className="btn btn-primary btn-sm" onClick={requestSubmit}>Submit Quiz</button>
          </div>
        </div>

        {/* Question navigation dots */}
        <div className="quiz-dots">
          {questions.map((q, i) => {
            const isAnswered = !!answers[q.id];
            const isFlagged = flagged.has(q.id);
            let cls = 'quiz-dot';
            if (isAnswered && isFlagged) cls += ' quiz-dot-flagged-answered';
            else if (isFlagged) cls += ' quiz-dot-flagged';
            else if (isAnswered) cls += ' quiz-dot-answered';
            return (
              <button key={q.id} className={cls} onClick={() => scrollToQuestion(i)}
                title={`Q${i + 1}${isAnswered ? ' answered' : ''}${isFlagged ? ' flagged' : ''}`}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Questions */}
      {questions.map((q, i) => (
        <div key={q.id} ref={el => questionRefs.current[q.id] = el}
          className={`quiz-question-card ${flagged.has(q.id) ? 'quiz-question-flagged' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.8rem' }}>
            <div style={{ fontWeight: 600 }}>Q{i + 1}. {q.question_text}</div>
            <button className={`quiz-flag-btn ${flagged.has(q.id) ? 'active' : ''}`}
              onClick={() => toggleFlag(q.id)} title={flagged.has(q.id) ? 'Unflag' : 'Flag for review'}>
              Flag
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
            {['a', 'b', 'c', 'd'].map(opt => {
              const isSelected = answers[q.id] === opt;
              return (
                <button key={opt} onClick={() => handleAnswer(q.id, opt)}
                  style={{
                    padding: '.6rem .9rem', borderRadius: 'var(--r)', textAlign: 'left',
                    border: `1.5px solid ${isSelected ? 'var(--blue)' : 'var(--border)'}`,
                    background: isSelected ? 'var(--blue-light)' : 'var(--white)',
                    color: isSelected ? 'var(--blue)' : 'var(--text)',
                    cursor: 'pointer', fontFamily: 'var(--fo)', fontSize: '.85rem', transition: 'all .15s',
                  }}>
                  <strong>{opt.toUpperCase()}.</strong> {q[`option_${opt}`]}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Bottom submit bar */}
      <div style={{ textAlign: 'center', padding: '1.5rem 0 3rem' }}>
        <button className="btn btn-primary" onClick={requestSubmit}
          style={{ padding: '.6rem 2rem', fontSize: '.88rem' }}>
          Submit Quiz ({answered}/{questions.length} answered)
        </button>
      </div>
    </div>
  );
}
