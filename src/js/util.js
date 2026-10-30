// Utilidades: DOM, ícones no estilo SF Symbols e formatação em pt-BR.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** h('div.a.b', {onclick}, ...filhos) */
export function h(tag, props, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

const P = {
  home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  mic: '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21M9 21h6"/>',
  album: '<rect x="3.5" y="6.5" width="14" height="14" rx="2.5"/><path d="M6.5 4h12a2 2 0 0 1 2 2v12"/><circle cx="10.5" cy="13.5" r="3"/><circle cx="10.5" cy="13.5" r=".6" fill="currentColor"/>',
  note: '<path d="M9 18V6.2l10-2.2v11.6"/><circle cx="6.6" cy="18" r="2.6"/><circle cx="16.6" cy="15.6" r="2.6"/>',
  genre: '<path d="M14.5 4.5 19.5 9.5M13 6l5 5-6.5 6.5a3.5 3.5 0 0 1-5-5z"/><circle cx="9.3" cy="14.7" r="1.2"/><path d="m4.5 19.5 2-2"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z"/>',
  star: '<path d="m12 3.8 2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7L12 3.8Z"/>',
  starFill: '<path fill="currentColor" d="m12 3.8 2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7L12 3.8Z"/>',
  playlist: '<path d="M4 6.5h11M4 11h11M4 15.5h6"/><path d="M14.5 19v-6.5l5.5-1.2"/><circle cx="12.6" cy="19" r="1.9"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.8"/><rect x="13" y="4" width="7" height="7" rx="1.8"/><rect x="4" y="13" width="7" height="7" rx="1.8"/><rect x="13" y="13" width="7" height="7" rx="1.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  play: '<path fill="currentColor" stroke="none" d="M7.5 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.3 0-1.7L9.1 4.3c-.7-.4-1.6.1-1.6.9Z"/>',
  pause: '<rect x="6.2" y="4.8" width="4" height="14.4" rx="1.3" fill="currentColor" stroke="none"/><rect x="13.8" y="4.8" width="4" height="14.4" rx="1.3" fill="currentColor" stroke="none"/>',
  next: '<path fill="currentColor" stroke="none" d="M3.5 7.1v9.8c0 .7.8 1.1 1.4.7l7.1-4.9c.5-.4.5-1.1 0-1.4L4.9 6.4c-.6-.4-1.4 0-1.4.7Zm9 0v9.8c0 .7.8 1.1 1.4.7l7.1-4.9c.5-.4.5-1.1 0-1.4l-7.1-4.9c-.6-.4-1.4 0-1.4.7Z"/>',
  prev: '<path fill="currentColor" stroke="none" d="M20.5 7.1v9.8c0 .7-.8 1.1-1.4.7L12 12.7c-.5-.4-.5-1.1 0-1.4l7.1-4.9c.6-.4 1.4 0 1.4.7Zm-9 0v9.8c0 .7-.8 1.1-1.4.7L3 12.7c-.5-.4-.5-1.1 0-1.4l7.1-4.9c.6-.4 1.4 0 1.4.7Z"/>',
  shuffle: '<path d="M3.5 7h3.2c2 0 3.1 1 4.3 3l2 3.6c1.1 2 2.3 3.4 4.4 3.4h3.1M3.5 17h3.2c1.4 0 2.4-.6 3.2-1.6M14.3 8.7C15.1 7.6 16 7 17.4 7h3.1"/><path d="m18 4.5 2.5 2.5L18 9.5M18 14.5l2.5 2.5-2.5 2.5"/>',
  repeat: '<path d="M4 11.5V10a3 3 0 0 1 3-3h12.5M20 12.5V14a3 3 0 0 1-3 3H4.5"/><path d="m17 4 3 3-3 3M7 20l-3-3 3-3"/>',
  repeat1: '<path d="M4 11.5V10a3 3 0 0 1 3-3h12.5M20 12.5V14a3 3 0 0 1-3 3H4.5"/><path d="m17 4 3 3-3 3M7 20l-3-3 3-3"/><path d="M11.2 10.6 12.6 10v4.6" stroke-width="1.5"/>',
  vol0: '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/>',
  vol: '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15 9a4.5 4.5 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/>',
  lyrics: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4 3.5V16.5h-.5a2 2 0 0 1-2-2z"/><path d="M8.5 9.5h1.5v2.5M13 9.5h1.5v2.5"/>',
  queue: '<path d="M4 6h11M4 10.5h11M4 15h7"/><path d="M15 13.5v6l5-3z" fill="currentColor"/>',
  more: '<circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 4.9 4.9"/>',
  back: '<path d="M14.5 5 8 12l6.5 7"/>',
  fwd: '<path d="M9.5 5 16 12l-6.5 7"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  explorer: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z"/><path d="m12.5 13.5 3 0M14 12v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"/><circle cx="12" cy="12" r="6.4"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6.5V4.8c0-.6.5-1 1-1h3c.6 0 1 .4 1 1v1.7M6.5 6.5l.9 12.2c.1 1 .9 1.8 1.9 1.8h5.4c1 0 1.8-.8 1.9-1.8l.9-12.2"/>',
  sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9.5 4.5v15M5.6 8h1.6M5.6 11h1.6"/>',
  nextUp: '<path d="M4 7h10M4 12h10M4 17h6"/><path d="m16 13 4 3-4 3z" fill="currentColor"/>',
  last: '<path d="M4 7h16M4 12h16M4 17h9"/><path d="M17 15v5M14.5 17.5h5"/>',
  chart: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V4"/>',
  sparkles: '<path d="M10 3.5c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z"/><path d="M18 14.5c.3 1.7 1.1 2.5 2.8 2.8-1.7.3-2.5 1.1-2.8 2.8-.3-1.7-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.1 2.8-2.8Z"/>',
  edit: '<path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z"/><path d="m13 7 4 4"/>',
  person: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  disc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/>',
  mini: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><rect x="11.5" y="11" width="7" height="6" rx="1.5" fill="currentColor"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
  restore: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9"/>',
  infinity: '<path d="M8.5 15.5C6 15.5 4 14 4 12s2-3.5 4.5-3.5c3.5 0 4.5 7 8 7 2.5 0 3.5-1.5 3.5-3.5s-1-3.5-3.5-3.5c-3.5 0-4.5 7-8 7Z"/>',
  check: '<path d="m5.5 12.5 4.2 4.2 8.8-9.4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"/><path d="M4.5 4.5V9H9M12 8v4l2.5 2"/>',
};

export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic ' + cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = P[name] || P.note;
  return s;
}

export const nf = new Intl.NumberFormat('pt-BR');
export const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const pad = n => String(n).padStart(2, '0');

export const fmt = {
  time(s) {
    s = Math.max(0, Math.floor(s || 0));
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
  },
  songs: n => `${nf.format(n)} ${n === 1 ? 'música' : 'músicas'}`,
  albums: n => `${nf.format(n)} ${n === 1 ? 'álbum' : 'álbuns'}`,
  total(secs) {
    const m = Math.round(secs / 60);
    if (m < 60) return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
    const hh = Math.floor(m / 60), mm = m % 60;
    return `${hh} ${hh === 1 ? 'hora' : 'horas'}${mm ? ` e ${mm} min` : ''}`;
  },
  ago(ts) {
    const d = (Date.now() - ts) / 864e5;
    if (d < 1) return 'Hoje';
    if (d < 2) return 'Ontem';
    if (d < 7) return `Há ${Math.floor(d)} dias`;
    return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  },
};

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** cor de destaque da capa (média dos pixels saturados), para os fundos */
const colorCache = new Map();
export function artColor(url) {
  if (colorCache.has(url)) return colorCache.get(url);
  const p = new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 24;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, 24, 24);
        const d = g.getImageData(0, 0, 24, 24).data;
        let r = 0, gg = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const w = 0.2 + (mx - mn) / 255;
          r += d[i] * w; gg += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        res([Math.round(r / n), Math.round(gg / n), Math.round(b / n)]);
      } catch {
        res(null);
      }
    };
    img.onerror = () => res(null);
    img.src = url;
  });
  colorCache.set(url, p);
  return p;
}
