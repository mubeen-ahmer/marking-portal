export default function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="modal-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
