import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

export default function Subjects() {
  const { profile, studentData } = useAuth();
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from('student_subjects')
        .select('subject_id, subjects(id, name)')
        .eq('student_id', profile.id);
      setSubjects((data || []).map(d => d.subjects).filter(Boolean));
      setLoading(false);
    })();
  }, [profile]);

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  return (
    <div>
      <div className="pg-hd"><h2>My Subjects</h2><p>Click a subject to view marks and assessments</p></div>
      {subjects.length === 0 ? (
        <div className="empty"><div className="ei">📭</div><p>No subjects enrolled yet. Contact admin.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
          {subjects.map(s => (
            <div key={s.id} className="rc-card" onClick={() => navigate(`/student/subjects/${s.id}`)}>
              <h4>📖 {s.name}</h4>
              <p>View marks & assessments</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
