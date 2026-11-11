import type { SVGProps } from 'react';
type IconName = 'globe' | 'network' | 'directory' | 'bookmark' | 'share' | 'message' | 'heart' | 'search' | 'filters' | 'download';
const paths: Record<IconName, string> = {
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  network: 'M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM6 9v6m3 3h6M8 8l8 8',
  directory: 'M4 4h16v16H4ZM4 9h16M9 9v11',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  share: 'M12 15V3m-4 4 4-4 4 4M5 11v10h14V11',
  message: 'M4 4h16v13H9l-5 4V4Zm4 5h8m-8 4h5',
  heart: 'M12 21 4 13C-2 6 7-1 12 6c5-7 14 0 8 7l-8 8Z',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6',
  filters: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
};
export function ScoutIcon({name,...props}:{name:IconName}&SVGProps<SVGSVGElement>) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
