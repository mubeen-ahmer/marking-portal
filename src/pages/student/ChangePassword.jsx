import { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';

export default function ChangePassword() {
  const { profile } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    if (!current || !newPw || !confirmPw) { setErr('Fill all fields'); return; }
    if (newPw !== confirmPw) { setErr('Passwords do not match'); return; }
    if (newPw.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      // Call the secure server-side function that verifies the old password
      const { error } = await supabase.rpc('change_my_password', {
        p_old_password: current,
        p_new_password: newPw,
      });
      if (error) {
        if (error.message.includes('Incorrect current password')) {
          setErr('Current password is incorrect');
        } else {
          setErr(error.message);
        }
        setSaving(false);
        return;
      }
      
      toast('Password updated successfully!');
      setCurrent(''); setNewPw(''); setConfirmPw('');
    } catch {
      setErr('Failed to update password. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="pg-hd"><h2>Change Password</h2><p>Update your student account password</p></div>
      <div className="pw-box">
        <form onSubmit={handleSubmit}>
          <div className="field"><label>Current Password</label><input type="password" value={current} onChange={e => setCurrent(e.target.value)} /></div>
          <div className="field"><label>New Password</label><input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} /></div>
          <div className="field"><label>Confirm New Password</label><input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} /></div>
          {err && <div className="err">{err}</div>}
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: '.5rem' }}>
            {saving ? <><span className="spin"></span> Saving…</> : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
