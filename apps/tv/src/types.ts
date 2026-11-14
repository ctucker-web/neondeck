export type CardShape = 'wide' | 'poster' | 'tile';

/** Anything the Home preview panel can describe. */
export interface Item {
  id: string;
  title: string;
  subtitle: string;
  meta: string[];
  synopsis: string;
  hue: number;
  glyph: string;
  progress?: number; // 0..1
  badge?: 'LIVE' | 'REC' | 'NEW';
}
