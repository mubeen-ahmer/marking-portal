import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast';
import Modal from '../../components/Modal';

const ITEM_TYPES = ['book', 'slides', 'video', 'doc', 'pdf', 'link'];

export default function Resources() {
  const toast = useToast();
  const [view, setView] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [err, setErr] = useState('');
  const [catId, setCatId] = useState(null);
  const [catLabel, setCatLabel] = useState('');
  const [cardId, setCardId] = useState(null);
  const [cardTitle, setCardTitle] = useState('');

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('resource_categories').select('*').order('sort_order');
    setCategories(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const loadCards = async (cId, cLabel) => {
    setCatId(cId); setCatLabel(cLabel); setView('cards'); setLoading(true);
    const { data } = await supabase.from('resource_cards').select('*').eq('category_id', cId).order('sort_order');
    setCards(data || []); setLoading(false);
  };

  const loadItems = async (cdId, cdTitle) => {
    setCardId(cdId); setCardTitle(cdTitle); setView('items'); setLoading(true);
    const { data } = await supabase.from('resource_items').select('*').eq('card_id', cdId).order('sort_order');
    setItems(data || []); setLoading(false);
  };

  const handleSave = async (table, data, id) => {
    setErr('');
    const required = Object.values(data).some(v => v === '' || v === undefined);
    if (required) { setErr('Fill all fields'); return; }
    let error;
    if (id) {
      ({ error } = await supabase.from(table).update(data).eq('id', id));
    } else {
      ({ error } = await supabase.from(table).insert(data));
    }
    if (error) { setErr(error.message); return; }
    toast(id ? 'Updated!' : 'Created!'); setModal(null);
    if (view === 'categories') loadCategories();
    else if (view === 'cards') loadCards(catId, catLabel);
    else loadItems(cardId, cardTitle);
  };

  const handleDelete = async (table, id, label) => {
    if (!confirm(`Delete "${label}"?`)) return;
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { toast(error.message, 'err'); return; }
    toast(`"${label}" deleted`);
    if (view === 'categories') loadCategories();
    else if (view === 'cards') loadCards(catId, catLabel);
    else loadItems(cardId, cardTitle);
  };

  if (loading) return <div className="loading"><span className="spin"></span> Loading…</div>;

  return (
    <div>
      {view === 'categories' && (
        <>
          <div className="pg-hd"><h2>Resources</h2><p>Manage resource categories</p></div>
          <div className="tbl-card">
            <div className="tbl-hd"><h3>Categories ({categories.length})</h3>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ label: '', icon: '', color: '#4F46E5', sort_order: 0 }); setModal('cat'); setErr(''); }}>+ Add Category</button>
            </div>
            <table><thead><tr><th>Label</th><th>Icon</th><th>Color</th><th>Order</th><th>Actions</th></tr></thead>
              <tbody>
                {categories.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No categories yet</td></tr> :
                  categories.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--blue)' }} onClick={() => loadCards(c.id, c.label)}>📚 {c.label}</td>
                      <td style={{ fontFamily: 'var(--fm)', fontSize: '.78rem' }}>{c.icon}</td>
                      <td><span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: c.color, verticalAlign: 'middle', marginRight: 6 }}></span>{c.color}</td>
                      <td style={{ fontFamily: 'var(--fm)' }}>{c.sort_order}</td>
                      <td style={{ display: 'flex', gap: '.3rem' }}>
                        <button className="btn btn-outline btn-xs" onClick={() => loadCards(c.id, c.label)}>View Cards</button>
                        <button className="btn btn-outline btn-xs" onClick={() => { setForm({ label: c.label, icon: c.icon, color: c.color, sort_order: c.sort_order, _id: c.id }); setModal('cat'); setErr(''); }}>Edit</button>
                        <button className="btn btn-danger btn-xs" onClick={() => handleDelete('resource_categories', c.id, c.label)}>Del</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'cards' && (
        <>
          <div className="pg-hd">
            <button className="btn btn-outline btn-sm" style={{ marginBottom: '.6rem' }} onClick={() => { setView('categories'); loadCategories(); }}>← Back to Categories</button>
            <h2>Cards — {catLabel}</h2><p>Manage cards in this category</p>
          </div>
          <div className="tbl-card">
            <div className="tbl-hd"><h3>Cards ({cards.length})</h3>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ title: '', description: '', icon: 'description', sort_order: 0 }); setModal('card'); setErr(''); }}>+ Add Card</button>
            </div>
            <table><thead><tr><th>Title</th><th>Description</th><th>Icon</th><th>Order</th><th>Actions</th></tr></thead>
              <tbody>
                {cards.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No cards yet</td></tr> :
                  cards.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--blue)' }} onClick={() => loadItems(c.id, c.title)}>📄 {c.title}</td>
                      <td style={{ fontSize: '.78rem', color: 'var(--text2)', maxWidth: 220 }}>{c.description}</td>
                      <td style={{ fontFamily: 'var(--fm)', fontSize: '.78rem' }}>{c.icon}</td>
                      <td style={{ fontFamily: 'var(--fm)' }}>{c.sort_order}</td>
                      <td style={{ display: 'flex', gap: '.3rem' }}>
                        <button className="btn btn-outline btn-xs" onClick={() => loadItems(c.id, c.title)}>View Items</button>
                        <button className="btn btn-outline btn-xs" onClick={() => { setForm({ title: c.title, description: c.description, icon: c.icon, sort_order: c.sort_order, _id: c.id }); setModal('card'); setErr(''); }}>Edit</button>
                        <button className="btn btn-danger btn-xs" onClick={() => handleDelete('resource_cards', c.id, c.title)}>Del</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'items' && (
        <>
          <div className="pg-hd">
            <button className="btn btn-outline btn-sm" style={{ marginBottom: '.6rem' }} onClick={() => loadCards(catId, catLabel)}>← Back to Cards</button>
            <h2>Items — {cardTitle}</h2><p>Manage resource files and links</p>
          </div>
          <div className="tbl-card">
            <div className="tbl-hd"><h3>Items ({items.length})</h3>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ label: '', type: '', url: '', sort_order: 0 }); setModal('item'); setErr(''); }}>+ Add Item</button>
            </div>
            <table><thead><tr><th>Label</th><th>Type</th><th>URL</th><th>Order</th><th>Actions</th></tr></thead>
              <tbody>
                {items.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>No items yet</td></tr> :
                  items.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500 }}>{item.label}</td>
                      <td><span className="tag tag-blue">{item.type}</span></td>
                      <td style={{ fontFamily: 'var(--fm)', fontSize: '.72rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a>
                      </td>
                      <td style={{ fontFamily: 'var(--fm)' }}>{item.sort_order}</td>
                      <td style={{ display: 'flex', gap: '.3rem' }}>
                        <button className="btn btn-outline btn-xs" onClick={() => { setForm({ label: item.label, type: item.type, url: item.url, sort_order: item.sort_order, _id: item.id }); setModal('item'); setErr(''); }}>Edit</button>
                        <button className="btn btn-danger btn-xs" onClick={() => handleDelete('resource_items', item.id, item.label)}>Del</button>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Dynamic Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)}>
        <h3>{form._id ? 'Edit' : 'Add'} {modal === 'cat' ? 'Category' : modal === 'card' ? 'Card' : 'Item'}</h3>
        {modal === 'cat' && (<>
          <div className="field"><label>Label</label><input value={form.label || ''} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. FAST" /></div>
          <div className="field"><label>Icon (Material Icon name)</label><input value={form.icon || ''} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="e.g. school" /></div>
          <div className="field"><label>Color (hex)</label><input value={form.color || ''} onChange={e => setForm({ ...form, color: e.target.value })} placeholder="#4F46E5" /></div>
          <div className="field"><label>Sort Order</label><input type="number" value={form.sort_order ?? 0} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} /></div>
        </>)}
        {modal === 'card' && (<>
          <div className="field"><label>Title</label><input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Study Materials" /></div>
          <div className="field"><label>Description</label><input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description" /></div>
          <div className="field"><label>Icon</label><input value={form.icon || ''} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="e.g. auto_stories" /></div>
          <div className="field"><label>Sort Order</label><input type="number" value={form.sort_order ?? 0} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} /></div>
        </>)}
        {modal === 'item' && (<>
          <div className="field"><label>Label</label><input value={form.label || ''} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Past Papers 2024" /></div>
          <div className="field"><label>Type</label>
            <select value={form.type || ''} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="">— Select —</option>
              {ITEM_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field"><label>URL</label><input type="url" value={form.url || ''} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div>
          <div className="field"><label>Sort Order</label><input type="number" value={form.sort_order ?? 0} onChange={e => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} /></div>
        </>)}
        {err && <div className="err">{err}</div>}
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={() => {
            const { _id, ...data } = form;
            if (modal === 'cat') handleSave('resource_categories', data, _id);
            else if (modal === 'card') handleSave('resource_cards', { ...data, category_id: catId }, _id);
            else handleSave('resource_items', { ...data, card_id: cardId }, _id);
          }}>{form._id ? 'Save' : 'Create'}</button>
          <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}
