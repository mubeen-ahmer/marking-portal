import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';

const TYPE_META = {
  book:   { icon: 'menu_book',      label: 'Book',   color: '#4F46E5', bg: '#EEF2FF' },
  slides: { icon: 'co_present',     label: 'Slides', color: '#059669', bg: '#ECFDF5' },
  video:  { icon: 'play_circle',    label: 'Video',  color: '#DC2626', bg: '#FEF2F2' },
  doc:    { icon: 'description',    label: 'Doc',    color: '#D97706', bg: '#FFFBEB' },
  pdf:    { icon: 'picture_as_pdf', label: 'PDF',    color: '#7C3AED', bg: '#F5F3FF' },
  link:   { icon: 'open_in_new',    label: 'Link',   color: '#0891B2', bg: '#ECFEFF' },
};
const getTypeMeta = (type) => TYPE_META[type] || TYPE_META.link;

const Icon = ({ name, size }) => (
  <span className="material-icons-round" style={size ? { fontSize: size } : undefined}>{name}</span>
);

export default function ResourceCenter() {
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState(null);
  const [modalCard, setModalCard] = useState(null);
  const [modalItems, setModalItems] = useState([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ identifier: '', password: '' });
  const [loginErr, setLoginErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u);
      if (u) loadData();
      else setLoading(false);
    });
  }, []);

  const loadData = useCallback(async () => {
    const { data: cats } = await supabase
      .from('resource_categories')
      .select(`id, label, icon, color, sort_order,
        resource_cards (id, title, description, icon, sort_order,
          resource_items (id, label, type, url, sort_order))`)
      .order('sort_order');

    const sorted = (cats || []).map(cat => ({
      ...cat,
      resource_cards: (cat.resource_cards || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(card => ({
          ...card,
          resource_items: (card.resource_items || []).sort((a, b) => a.sort_order - b.sort_order),
        })),
    }));
    setCategories(sorted);
    if (sorted.length > 0) setActiveCat(sorted[0].id);
    setLoading(false);
  }, []);

  const openCard = (card) => {
    setModalCard(card);
    setModalItems(card.resource_items || []);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginErr('');
    const raw = loginForm.identifier.trim();
    const email = /^[A-Za-z]{2}\d{2}-\d{3}$/i.test(raw) ? raw.toLowerCase() + '@student.local' : raw;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: loginForm.password });
      if (error) throw error;
      setUser(data.user); setLoginOpen(false); setLoading(true);
      await loadData();
    } catch {
      setLoginErr('Invalid credentials. Please try again.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setCategories([]); setActiveCat(null);
  };

  const activeCatData = categories.find(c => c.id === activeCat);

  // ═══ LOGGED OUT VIEW ═══
  if (!user) {
    return (
      <div className="rc">
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />

        <section className="rc-hero2">
          <div className="rc-hero2-inner">
            <p className="rc-hero2-label">Knowledge at your fingertips</p>
            <h1 className="rc-hero2-title">Resource <em>Center</em></h1>
            <p className="rc-hero2-desc">Browse curated materials across all departments. Click any card to explore books, slides, documents and more.</p>
          </div>
          <div className="rc-hero2-shapes">
            <div className="rc-shape rc-s1"></div>
            <div className="rc-shape rc-s2"></div>
            <div className="rc-shape rc-s3"></div>
          </div>
        </section>

        <div className="rc-promo2">
          <h2>Unlock <em>All Resources</em></h2>
          <p>Join EduMark to get instant access to study materials, past papers, lecture slides and more for FAST, NUST, ECAT and MDCAT.</p>
          <div className="rc-promo-feats">
            {[
              { icon: 'school', text: 'FAST Materials' },
              { icon: 'menu_book', text: 'NUST Resources' },
              { icon: 'explore', text: 'ECAT Prep' },
              { icon: 'science', text: 'MDCAT Guides' },
              { icon: 'co_present', text: 'Lecture Slides' },
              { icon: 'edit_note', text: 'Past Papers' },
            ].map((f, i) => (
              <span key={i} className="rc-promo-feat"><Icon name={f.icon} /> {f.text}</span>
            ))}
          </div>
          <button className="rc-promo-btn2" onClick={() => { setLoginOpen(true); setLoginErr(''); setLoginForm({ identifier: '', password: '' }); }}>
            <Icon name="lock_open" /> Sign In to Access
          </button>
        </div>

        {loginOpen && (
          <div className="rc-login-ov2" onClick={() => setLoginOpen(false)}>
            <div className="rc-login-box2" onClick={e => e.stopPropagation()}>
              <h2>Welcome Back</h2>
              <p>Sign in with your EduMark student, teacher or admin account to access all resources.</p>
              <form onSubmit={handleLogin}>
                <div className="rc-login-field">
                  <label>Email / Roll Number</label>
                  <input type="text" value={loginForm.identifier}
                    onChange={e => setLoginForm({ ...loginForm, identifier: e.target.value })}
                    placeholder="e.g. AB26-001 or teacher@email.com" autoFocus />
                </div>
                <div className="rc-login-field">
                  <label>Password</label>
                  <input type="password" value={loginForm.password}
                    onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                    placeholder="Your password" />
                </div>
                {loginErr && <div className="rc-login-err">{loginErr}</div>}
                <button className="rc-login-submit" type="submit">Sign In</button>
              </form>
              <span className="rc-login-cancel" onClick={() => setLoginOpen(false)}>Cancel</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══ LOADING ═══
  if (loading) return (
    <div className="rc">
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5rem', gap: '.8rem', color: '#9A948E', fontSize: '14px' }}>
        <span className="spin" style={{ borderTopColor: '#C8502A' }}></span> Loading resources…
      </div>
    </div>
  );

  // ═══ LOGGED IN VIEW ═══
  return (
    <div className="rc">
      <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />

      {/* Header */}
      <header className="rc-header">
        <div className="rc-header-inner">
          <div className="rc-logo">
            <div className="rc-logo-icon"><Icon name="school" /></div>
            <div>
              <div className="rc-logo-name">EduMark</div>
              <div className="rc-logo-sub">Resource Center</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="rc-user-pill"><div className="rc-user-dot"></div> Logged In</div>
            <button className="rc-logout-btn" onClick={handleLogout}>Sign out</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="rc-hero2">
        <div className="rc-hero2-inner">
          <p className="rc-hero2-label">Knowledge at your fingertips</p>
          <h1 className="rc-hero2-title">Resource <em>Center</em></h1>
          <p className="rc-hero2-desc">Browse curated materials across all departments. Click any card to explore books, slides, documents and more.</p>
        </div>
        <div className="rc-hero2-shapes">
          <div className="rc-shape rc-s1"></div>
          <div className="rc-shape rc-s2"></div>
          <div className="rc-shape rc-s3"></div>
        </div>
      </section>

      {/* Category Nav */}
      <nav className="rc-cat-nav">
        {categories.map(c => (
          <button key={c.id}
            className={`rc-cat-btn ${activeCat === c.id ? 'active' : ''}`}
            style={activeCat === c.id ? { borderBottomColor: c.color, color: c.color } : undefined}
            onClick={() => setActiveCat(c.id)}>
            <Icon name={c.icon} /> {c.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="rc-main">
        {activeCatData && (
          <>
            <div className="rc-section-header">
              <h2 className="rc-section-title" style={{ color: activeCatData.color }}>
                <Icon name={activeCatData.icon} size={28} /> {activeCatData.label}
              </h2>
              <span className="rc-section-count">
                {activeCatData.resource_cards.length} resource{activeCatData.resource_cards.length !== 1 ? 's' : ''}
              </span>
            </div>

            {activeCatData.resource_cards.length === 0 ? (
              <div className="rc-empty">
                <Icon name="inbox" size={52} />
                <p>No resources yet.</p>
              </div>
            ) : (
              <div className="rc-cards-grid">
                {activeCatData.resource_cards.map(card => (
                  <div key={card.id} className="rc-card2" onClick={() => openCard(card)}
                    style={{ '--card-color': activeCatData.color, '--card-color-light': activeCatData.color + '15' }}>
                    <div className="rc-card-icon-wrap">
                      <Icon name={card.icon} size={26} />
                    </div>
                    <h3 className="rc-card-title">{card.title}</h3>
                    <p className="rc-card-desc">{card.description}</p>
                    <div className="rc-card-footer">
                      <span className="rc-card-count"><Icon name="folder_open" size={15} /> {card.resource_items.length} file{card.resource_items.length !== 1 ? 's' : ''}</span>
                      <div className="rc-card-arrow"><Icon name="arrow_forward" size={16} /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Resource Items Modal */}
      {modalCard && (
        <div className="rc-modal-ov" onClick={() => setModalCard(null)}>
          <div className="rc-modal" onClick={e => e.stopPropagation()}>
            <button className="rc-modal-close" onClick={() => setModalCard(null)}>
              <Icon name="close" size={18} />
            </button>
            <div className="rc-modal-header">
              <div className="rc-modal-icon"><Icon name={modalCard.icon} size={30} /></div>
              <div>
                <h2 className="rc-modal-title">{modalCard.title}</h2>
                <p className="rc-modal-desc">{modalCard.description}</p>
              </div>
            </div>
            <div className="rc-modal-resources">
              {modalItems.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#9A948E', padding: '2rem', fontSize: '14px' }}>No items yet.</p>
              ) : modalItems.map(res => {
                const meta = getTypeMeta(res.type);
                return (
                  <a key={res.id} className="rc-res-item" href={res.url} target="_blank" rel="noopener noreferrer"
                    style={{ '--item-color': meta.color, '--item-bg': meta.bg }}>
                    <div className="rc-res-badge"><Icon name={meta.icon} size={20} /></div>
                    <span className="rc-res-label">{res.label}</span>
                    <span className="rc-res-tag">{meta.label}</span>
                    <span className="rc-res-open"><Icon name="open_in_new" size={16} /></span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
