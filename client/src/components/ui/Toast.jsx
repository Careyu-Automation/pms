import { X } from 'lucide-react';

export function ToastRegion({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="toast-region" aria-label="Status messages">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone || 'info'}`} role="status">
          <p className="toast__message">{toast.message}</p>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss message"
            onClick={() => onDismiss(toast.id)}
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
