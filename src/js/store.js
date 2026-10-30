// Biblioteca: músicas, álbuns, artistas, gêneros, playlists, favoritas e contagem de reproduções.

import { api } from './api.js';
import { norm, debounce, shuffled } from './util.js';

const DEFAULT = {
  folders: [],
  playlists: [],
  loved: {},
  plays: {},
  lyrics: {},
  settings: { theme: 'auto', volume: 0.8, shuffle: false, repeat: 'off', lyricsOnline: true },
  session: null,
  collapsed: {},
};

export const S = { tracks: [], byId: new Map(), data: structuredClone(DEFAULT), version: 0, listeners: new Set() };

const persist = debounce(() => api.saveState(S.data), 400);
const cache = new Map();
export function save(silent) {
  S.version++;
  cache.clear();
  persist();
  if (!silent) emit();
}
export const saveQuiet = () => persist();
export const emit = () => S.listeners.forEach(f => f());
export const onChange = f => S.listeners.add(f);

export async function loadData() {
  const d = await api.loadState();
  if (d && typeof d === 'object') S.data = { ...structuredClone(DEFAULT), ...d, settings: { ...DEFAULT.settings, ...(d.settings || {}) } };
}

const memo = (k, fn) => (cache.has(k) ? cache.get(k) : (cache.set(k, fn()), cache.get(k)));

export function setTracks(list) {
  for (const t of list) {
    t.albumKey = norm((t.albumArtist || t.artist) + '|' + (t.album || t.title));
    t.artistKey = norm(t.albumArtist || t.artist);
  }
  S.tracks = list;
  S.byId = new Map(list.map(t => [t.id, t]));
  cache.clear();
  emit();
}

const byTitle = (a, b) => a.title.localeCompare(b.title, 'pt-BR');
export const songs = () => memo('songs', () => S.tracks.slice().sort(byTitle));

/** álbuns: músicas agrupadas por artista do álbum + nome do álbum (sem álbum = single com o nome da música) */
export const albums = () =>
  memo('albums', () => {
    const m = new Map();
    for (const t of S.tracks) {
      if (!m.has(t.albumKey)) m.set(t.albumKey, { key: t.albumKey, title: t.album || t.title, artist: t.albumArtist || t.artist, tracks: [], single: !t.album });
      m.get(t.albumKey).tracks.push(t);
    }
    for (const a of m.values()) {
      a.tracks.sort((x, y) => (x.disc || 1) - (y.disc || 1) || (x.track || 999) - (y.track || 999) || byTitle(x, y));
      a.cover = a.tracks.find(t => t.art) || a.tracks[0];
      a.year = Math.max(0, ...a.tracks.map(t => t.year || 0));
      a.genre = a.tracks.find(t => t.genre)?.genre || '';
      a.added = Math.max(...a.tracks.map(t => t.added || t.mtime));
      a.dur = a.tracks.reduce((s, t) => s + t.dur, 0);
    }
    return [...m.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  });
export const albumByKey = k => albums().find(a => a.key === k);
export const albumOf = t => albumByKey(t.albumKey);

export const artists = () =>
  memo('artists', () => {
    const m = new Map();
    for (const t of S.tracks) {
      const k = t.artistKey;
      if (!m.has(k)) m.set(k, { key: k, name: t.albumArtist || t.artist, tracks: [] });
      m.get(k).tracks.push(t);
    }
    for (const a of m.values()) {
      a.albums = albums().filter(x => norm(x.artist) === a.key);
      a.cover = a.tracks.find(t => t.art) || a.tracks[0];
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });
export const artistByKey = k => artists().find(a => a.key === k);

export const genres = () =>
  memo('genres', () => {
    const m = new Map();
    for (const t of S.tracks) {
      const g = t.genre || 'Sem gênero';
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(t);
    }
    return [...m].map(([name, tracks]) => ({ name, tracks: tracks.sort(byTitle), cover: tracks.find(t => t.art) || tracks[0] })).sort((a, b) => b.tracks.length - a.tracks.length);
  });

export const recentlyAdded = () => memo('recentAdded', () => albums().slice().sort((a, b) => b.added - a.added));
export const recentlyPlayed = () =>
  memo('recentPlayed', () => {
    const seen = new Set(), out = [];
    const list = Object.entries(S.data.plays).filter(([id]) => S.byId.has(id)).sort((a, b) => b[1].last - a[1].last);
    for (const [id] of list) {
      const a = albumOf(S.byId.get(id));
      if (a && !seen.has(a.key)) { seen.add(a.key); out.push(a); }
    }
    return out;
  });
export const topPlayed = (n = 25) => memo('top' + n, () => Object.entries(S.data.plays).filter(([id, p]) => S.byId.has(id) && p.n > 0).sort((a, b) => b[1].n - a[1].n).slice(0, n).map(([id]) => S.byId.get(id)));
export const lovedTracks = () => memo('loved', () => Object.entries(S.data.loved).filter(([id]) => S.byId.has(id)).sort((a, b) => b[1] - a[1]).map(([id]) => S.byId.get(id)));
export const isLoved = t => !!S.data.loved[t?.id];
export function toggleLove(ids, v) {
  for (const id of ids) (v ?? !S.data.loved[id]) ? (S.data.loved[id] = Date.now()) : delete S.data.loved[id];
  save();
}

export function countPlay(t) {
  const p = (S.data.plays[t.id] ||= { n: 0, last: 0 });
  p.n++;
  p.last = Date.now();
  save(true);
}
export function touchPlay(t) {
  const p = (S.data.plays[t.id] ||= { n: 0, last: 0 });
  p.last = Date.now();
  saveQuiet();
}

// ---------- playlists ----------
export const playlistById = id => S.data.playlists.find(p => p.id === id);
export const playlistTracks = p => p.items.map(id => S.byId.get(id)).filter(Boolean);
export function createPlaylist(name, ids = []) {
  const p = { id: 'p' + Date.now().toString(36), name: name || 'Nova Playlist', items: [...ids], created: Date.now(), desc: '' };
  S.data.playlists.push(p);
  save();
  return p;
}
export function addToPlaylist(pid, ids) {
  const p = playlistById(pid);
  if (!p) return 0;
  const before = p.items.length;
  for (const id of ids) if (!p.items.includes(id)) p.items.push(id);
  save();
  return p.items.length - before;
}

// ---------- mixes (como "Feito para Você") ----------
export const mixes = () =>
  memo('mixes', () => {
    const out = [];
    const day = Math.floor(Date.now() / 864e5);
    const pick = (list, n) => shuffledSeeded(list, day).slice(0, n);
    if (lovedTracks().length >= 3) out.push({ id: 'mix-fav', title: 'Mix Favoritas', sub: 'Suas músicas favoritas', tracks: pick(lovedTracks(), 50), colors: ['#fa2d48', '#a1146b'] });
    out.push({ id: 'mix-new', title: 'Mix Novidades', sub: 'O que entrou por último', tracks: S.tracks.slice().sort((a, b) => b.added - a.added).slice(0, 40), colors: ['#0a84ff', '#5e2ced'] });
    out.push({ id: 'mix-all', title: 'Mix Descoberta', sub: 'Toda a sua biblioteca', tracks: pick(S.tracks, 60), colors: ['#ff9f0a', '#ff375f'] });
    const palette = [['#30d158', '#007a5e'], ['#bf5af2', '#4b1fa8'], ['#64d2ff', '#0a5ad6'], ['#ffd60a', '#ff6a00']];
    genres().filter(g => g.name !== 'Sem gênero' && g.tracks.length >= 3).slice(0, 4).forEach((g, i) => out.push({ id: 'mix-g-' + g.name, title: `Mix ${g.name}`, sub: `${g.tracks.length} músicas`, tracks: pick(g.tracks, 50), colors: palette[i % palette.length] }));
    return out;
  });
function shuffledSeeded(list, seed) {
  let s = seed >>> 0 || 1;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export { shuffled };

// ---------- busca ----------
export function search(q) {
  const toks = norm(q).split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const hit = s => toks.every(t => norm(s).includes(t));
  return {
    songs: S.tracks.filter(t => hit(`${t.title} ${t.artist} ${t.album} ${t.genre}`)).sort(byTitle),
    albums: albums().filter(a => hit(`${a.title} ${a.artist}`)),
    artists: artists().filter(a => hit(a.name)),
    playlists: S.data.playlists.filter(p => hit(p.name)),
  };
}
