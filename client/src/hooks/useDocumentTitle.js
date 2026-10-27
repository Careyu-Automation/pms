import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · CareYu` : 'CareYu Automation';
  }, [title]);
}
