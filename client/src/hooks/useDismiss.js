import { useEffect } from 'react';

export function useDismiss(ref, onDismiss, active) {
  useEffect(() => {
    if (!active) return undefined;

    const onPointer = (event) => {
      if (!ref.current?.contains(event.target)) onDismiss();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss();
    };

    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onDismiss, active]);
}
