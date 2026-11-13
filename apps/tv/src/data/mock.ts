// Mock data for milestone 1. Every name here is invented; real data arrives
// from the hub service in milestone 2.

export type CardShape = 'wide' | 'poster' | 'tile';

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

export interface Shelf {
  id: string;
  title: string;
  shape: CardShape;
  items: Item[];
}

const ch = (n: string, name: string, show: string, next: string, hue: number, progress: number, group: string): Item => ({
  id: `ch-${n}`,
  title: show,
  subtitle: `${n} · ${name}`,
  meta: [group, 'HD', `Next: ${next}`],
  synopsis: `Now on ${name}. Press OK to tune, or hold OK for record and favorite options.`,
  hue,
  glyph: n,
  progress,
  badge: 'LIVE',
});

export const shelves: Shelf[] = [
  {
    id: 'continue',
    title: 'Continue Watching',
    shape: 'wide',
    items: [
      { id: 'c1', title: 'Glass Horizon', subtitle: 'S2 · E4 — Low Orbit', meta: ['Series', '2024', '52 min', '4K'], synopsis: 'A salvage crew answers a distress call from a station that was decommissioned eleven years ago.', hue: 190, glyph: 'GH', progress: 0.62 },
      { id: 'c2', title: 'The Long Division', subtitle: '1 h 12 min left', meta: ['Movie', '2022', '2 h 08 min', 'HD'], synopsis: 'Two rival mathematicians are forced to share an office, a grant, and eventually a getaway car.', hue: 312, glyph: 'LD', progress: 0.44 },
      { id: 'c3', title: 'Tidewater', subtitle: 'S1 · E7 — Brackish', meta: ['Series', '2025', '47 min', 'HD'], synopsis: 'The harbor master finds the missing ledger, and wishes she had not.', hue: 150, glyph: 'TW', progress: 0.18 },
      { id: 'c4', title: 'Kiln', subtitle: 'Documentary · 18 min left', meta: ['Documentary', '2023', '1 h 34 min'], synopsis: 'Four potters, one wood-fired kiln, and five days without sleep.', hue: 28, glyph: 'KN', progress: 0.81 },
      { id: 'c5', title: 'Night Bus 47', subtitle: 'S3 · E1 — Terminus', meta: ['Series', '2025', '31 min'], synopsis: 'The last route of the night picks up a passenger nobody remembers boarding.', hue: 262, glyph: 'NB', progress: 0.07 },
    ],
  },
  {
    id: 'live',
    title: 'Live Now',
    shape: 'wide',
    items: [
      ch('2.1', 'Metro Public', 'Evening Report', 'Weather Desk', 200, 0.7, 'Antenna'),
      ch('4.1', 'KVLT', 'City Council Live', 'Local Voices', 330, 0.35, 'Antenna'),
      ch('7.2', 'Classic Reel', 'Midnight Matinee', 'Short Subjects', 45, 0.52, 'Antenna'),
      ch('101', 'Orbit News', 'World Briefing', 'Markets Open', 180, 0.15, 'FAST'),
      ch('114', 'Trailhead', 'Ridge Lines', 'Camp Kitchen', 120, 0.9, 'FAST'),
      ch('120', 'Loop Lounge', 'Ambient Hours', 'Slow Rail', 280, 0.26, 'FAST'),
      ch('133', 'Workbench', 'Restoration Bay', 'Joinery Basics', 20, 0.6, 'FAST'),
    ],
  },
  {
    id: 'apps',
    title: 'Apps',
    shape: 'tile',
    items: ['Streamly', 'CineBox', 'TubeView', 'Sportcast', 'KidsHub', 'Tunes'].map((name, i) => ({
      id: `app-${i}`,
      title: name,
      subtitle: 'App',
      meta: ['Opens in the built-in browser'],
      synopsis: `Launch ${name}. App tiles are yours to add, remove, and reorder in Settings.`,
      hue: [190, 312, 0, 130, 50, 262][i],
      glyph: name.slice(0, 1),
    })),
  },
  {
    id: 'recordings',
    title: 'Latest Recordings',
    shape: 'wide',
    items: [
      { id: 'r1', title: 'Evening Report', subtitle: 'Today · 6:00 PM · Metro Public', meta: ['Recording', '30 min', '1.4 GB'], synopsis: 'Recorded by series rule “Evening Report — new episodes”.', hue: 200, glyph: 'ER', badge: 'NEW' },
      { id: 'r2', title: 'Midnight Matinee', subtitle: 'Recording now · Classic Reel', meta: ['Recording', 'In progress'], synopsis: 'Started at 9:00 PM. You can start watching from the beginning while it records.', hue: 45, glyph: 'MM', badge: 'REC', progress: 0.52 },
      { id: 'r3', title: 'Ridge Lines', subtitle: 'Yesterday · Trailhead', meta: ['Recording', '58 min', '2.1 GB'], synopsis: 'A traverse of the northern escarpment in early winter.', hue: 120, glyph: 'RL' },
      { id: 'r4', title: 'City Council Live', subtitle: 'Tue · KVLT', meta: ['Recording', '2 h 10 min', '5.8 GB'], synopsis: 'Regular session, including the transit budget vote.', hue: 330, glyph: 'CC' },
    ],
  },
  {
    id: 'recent',
    title: 'Recently Added',
    shape: 'poster',
    items: [
      ['Paper Satellites', 2025, 210], ['Underpass', 2024, 300], ['Salt & Signal', 2023, 170], ['The Quiet Shift', 2025, 30],
      ['Halogen', 2022, 55], ['Marrow Road', 2024, 340], ['Second Sun', 2025, 15], ['Lowlight', 2021, 240], ['Field Notes', 2023, 95],
    ].map(([title, year, hue], i) => ({
      id: `m-${i}`,
      title: title as string,
      subtitle: String(year),
      meta: ['Movie', String(year), `${95 + i * 4} min`, i % 2 ? 'HD' : '4K'],
      synopsis: 'Added to your library this week. Metadata and artwork come from your Jellyfin server.',
      hue: hue as number,
      glyph: (title as string).split(' ').map((w) => w[0]).join('').slice(0, 2),
      badge: i < 2 ? ('NEW' as const) : undefined,
    })),
  },
];

export const status = {
  network: { label: 'LAN', detail: '1.0 Gb' },
  tuners: { inUse: 1, total: 4, state: 'REC' },
  storage: { usedTb: 1.2, totalTb: 4.0 },
  profile: 'CT',
};
