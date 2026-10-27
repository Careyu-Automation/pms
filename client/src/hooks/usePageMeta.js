import { useMatches } from 'react-router-dom';

const FALLBACK = {
  title: 'CareYu',
  description: '',
  note: '',
  icon: 'LayoutDashboard',
  crumbs: [],
};

export function usePageMeta() {
  const matches = useMatches();
  const match = [...matches].reverse().find((item) => item.handle?.title);
  return match?.handle || FALLBACK;
}
