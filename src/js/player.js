// Reprodução: fila, aleatório/repetir, reprodução automática, teclas de mídia do Windows (Media Session),
// barra de reprodução flutuante, tela "Tocando Agora", letras sincronizadas e painel "A Seguir".

import { api, artUrl, audioUrl, native } from './api.js';
import { h, icon, fmt, shuffled, $, artColor } from './util.js';
import { S, save, saveQuiet, countPlay, touchPlay, isLoved, toggleLove, albumOf, genres } from './store.js';
import { toast, menu } from './ui.js';

// Dois tocadores: o AutoMix toca o fim de uma música junto com o começo da próxima, trocando o volume aos poucos.
const mk = () => Object.assign(new Audio(), { preload: 'auto', crossOrigin: 'anonymous' });
const A = [mk(), mk()];
let ai = 0;
/** o tocador da música atual */
export const aud = () => A[ai];
const other = () => A[ai ^ 1];
const XF = 7; // segundos de transição
let vol = 0.8, mix = null;

export const P = {
  queue: [], // ids na ordem de reprodução
  base: [], // ordem original (para desligar o aleatório)
  index: -1,
  history: [],
  context: '',
  counted: false,
  listeners: new Set(),
};
const fire = what => P.listeners.forEach(f => f(what));
export const onPlayer = f => P.listeners.add(f);
export const current = () => S.byId.get(P.queue[P.index]);
export const isPlaying = () => !aud().paused && !aud().ended;

// ---------- comandos ----------
export function play(list, start = 0, { shuffle, context } = {}) {
  const ids = list.map(t => t.id ?? t);
  if (!ids.length) return;
  if (!native) toast('No navegador é só demonstração: instale o app para ouvir', 'info');
  P.base = ids.slice();
  P.context = context || '';
  const sh = shuffle ?? S.data.settings.shuffle;
  if (shuffle != null) S.data.settings.shuffle = shuffle;
  if (sh) {
    const first = shuffle && start === 0 ? ids[Math.floor(Math.random() * ids.length)] : ids[start];
    P.queue = [first, ...shuffled(ids.filter(x => x !== first))];
    P.index = 0;
  } else {
    P.queue = ids.slice();
    P.index = start;
  }
  load(true);
  save(true);
}

export function playNext(ids) {
  if (P.index < 0) return play(ids);
  P.queue.splice(P.index + 1, 0, ...ids);
  P.base.push(...ids);
  fire('queue');
  persistSession();
}
export function playLast(ids) {
  if (P.index < 0) return play(ids);
  P.queue.push(...ids);
  P.base.push(...ids);
  fire('queue');
  persistSession();
}

function stopMix() {
  if (!mix) return;
  cancelAnimationFrame(mix.raf);
  mix = null;
  other().pause();
  other().volume = vol;
  aud().volume = vol;
}

function announce(t) {
  P.counted = false;
  touchPlay(t);
  mediaSession(t);
  fire('track');
  persistSession();
}

function load(autoplay, at = 0) {
  const t = current();
  if (!t) return;
  stopMix();
  const a = aud();
  a.volume = vol;
  a.src = audioUrl(t);
  if (at) a.currentTime = at;
  if (autoplay) a.play().catch(() => {});
  announce(t);
}

/** índice da próxima música (ou -1), preenchendo a fila se a reprodução automática estiver ligada */
function nextIndex() {
  if (P.index + 1 < P.queue.length) return P.index + 1;
  if (S.data.settings.repeat === 'all') return 0;
  if (S.data.settings.autoplay !== false && autoFill()) return P.index + 1;
  return -1;
}

export function toggle() {
  if (!current()) {
    if (S.tracks.length) play(S.tracks, 0, { shuffle: true });
    return;
  }
  if (aud().paused) aud().play().catch(() => {}); else aud().pause();
}
export function next(auto) {
  if (P.index < 0) return;
  if (auto && S.data.settings.repeat === 'one') {
    aud().currentTime = 0;
    aud().play();
    return;
  }
  const n = nextIndex();
  if (n < 0) {
    aud().pause();
    aud().currentTime = 0;
    fire('state');
    return;
  }
  P.history.push(P.queue[P.index]);
  P.index = n;
  load(true);
}
export function prev() {
  if (aud().currentTime > 3 || P.index <= 0) {
    aud().currentTime = 0;
    return;
  }
  P.index--;
  load(true);
}
export function seek(t) {
  stopMix();
  if (isFinite(t)) aud().currentTime = Math.max(0, Math.min(aud().duration || 0, t));
}
export function setVolume(v) {
  vol = Math.max(0, Math.min(1, v));
  A.forEach(a => (a.muted = false));
  if (!mix) aud().volume = vol;
  S.data.settings.volume = vol;
  saveQuiet();
  fire('volume');
}
export const volume = () => vol;
export function toggleMute() {
  const m = !aud().muted;
  A.forEach(a => (a.muted = m));
  fire('volume');
}
export function setShuffle(on) {
  S.data.settings.shuffle = on;
  const cur = P.queue[P.index];
  if (cur) {
    if (on) {
      const rest = P.queue.slice(P.index + 1);
      P.queue = [...P.queue.slice(0, P.index + 1), ...shuffled(rest)];
    } else {
      P.queue = P.base.slice();
      P.index = Math.max(0, P.queue.indexOf(cur));
    }
  }
  save(true);
  fire('mode');
}
export function cycleRepeat() {
  const r = S.data.settings.repeat;
  S.data.settings.repeat = r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
  save(true);
  fire('mode');
}

/** fim da fila: continua com músicas parecidas (mesmo gênero/artista), como a reprodução automática */
function autoFill() {
  const t = current();
  if (!t || S.tracks.length < 2) return false;
  const inQ = new Set(P.queue);
  const same = S.tracks.filter(x => !inQ.has(x.id) && (x.genre && x.genre === t.genre || x.artistKey === t.artistKey));
  const pool = same.length >= 3 ? same : S.tracks.filter(x => !inQ.has(x.id));
  const add = shuffled(pool.length ? pool : S.tracks.filter(x => x.id !== t.id)).slice(0, 15).map(x => x.id);
  if (!add.length) return false;
  P.queue.push(...add);
  P.base.push(...add);
  fire('queue');
  return true;
}

// ---------- AutoMix ----------
/** começa a próxima música por baixo dos últimos segundos da atual (curva de potência constante) */
function startMix() {
  const n = nextIndex();
  if (n < 0) return;
  const t = S.byId.get(P.queue[n]);
  if (!t || t.dur < 30) return;
  const from = aud();
  P.history.push(P.queue[P.index]);
  P.index = n;
  ai ^= 1;
  const to = aud();
  to.src = audioUrl(t);
  to.volume = 0;
  to.muted = from.muted;
  to.play().catch(() => {});
  const left = (from.duration - from.currentTime) || XF;
  const t0 = performance.now(), dur = Math.max(2, Math.min(XF, left)) * 1000;
  mix = { from, to };
  const step = () => {
    if (!mix) return;
    const k = Math.min(1, (performance.now() - t0) / dur);
    to.volume = vol * Math.sin((k * Math.PI) / 2);
    from.volume = vol * Math.cos((k * Math.PI) / 2);
    if (k < 1 && !from.ended) mix.raf = requestAnimationFrame(step);
    else {
      from.pause();
      from.volume = vol;
      to.volume = vol;
      mix = null;
    }
  };
  mix.raf = requestAnimationFrame(step);
  announce(t);
}

// ---------- eventos do áudio (só o tocador atual conta) ----------
let errStreak = 0;
const mine = fn => e => { if (e.target === aud()) fn(e); };
for (const a of A) {
  a.addEventListener('play', mine(() => fire('state')));
  a.addEventListener('pause', mine(() => { fire('state'); persistSession(); }));
  a.addEventListener('ended', mine(() => next(true)));
  a.addEventListener('timeupdate', mine(() => {
    const t = current(), a2 = aud();
    if (t && !P.counted && a2.duration && (a2.currentTime > a2.duration * 0.5 || a2.currentTime > 240)) {
      P.counted = true;
      countPlay(t);
    }
    if (S.data.settings.automix !== false && !mix && a2.duration > 40 && a2.duration - a2.currentTime <= XF && !a2.paused && S.data.settings.repeat !== 'one') startMix();
    fire('time');
    if ('mediaSession' in navigator && a2.duration) {
      try { navigator.mediaSession.setPositionState({ duration: a2.duration, position: a2.currentTime, playbackRate: 1 }); } catch {}
    }
  }));
  a.addEventListener('error', mine(() => {
    if (!native || !aud().src) return;
    toast(`Não foi possível tocar “${current()?.title || ''}”`, 'info');
    if (++errStreak < 5) next();
  }));
  a.addEventListener('playing', mine(() => (errStreak = 0)));
}


function mediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  const a = artUrl(t);
  navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album, artwork: a ? [{ src: a, sizes: '600x600', type: 'image/jpeg' }] : [] });
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => aud().play());
  ms.setActionHandler('pause', () => aud().pause());
  ms.setActionHandler('previoustrack', prev);
  ms.setActionHandler('nexttrack', () => next());
  ms.setActionHandler('seekto', e => seek(e.seekTime));
}

// ---------- sessão (retoma de onde parou) ----------
let lastPersist = 0;
function persistSession() {
  S.data.session = { queue: P.queue.slice(0, 2000), base: P.base.slice(0, 2000), index: P.index, time: aud().currentTime || 0, context: P.context };
  saveQuiet();
}
setInterval(() => { if (isPlaying() && Date.now() - lastPersist > 5000) { lastPersist = Date.now(); persistSession(); } }, 5000);

export function restoreSession() {
  vol = S.data.settings.volume ?? 0.8;
  A.forEach(a => (a.volume = vol));
  const s = S.data.session;
  if (!s?.queue?.length) return;
  P.queue = s.queue.filter(id => S.byId.has(id));
  P.base = (s.base || s.queue).filter(id => S.byId.has(id));
  P.index = Math.min(Math.max(0, P.queue.indexOf(s.queue[s.index])), P.queue.length - 1);
  P.context = s.context || '';
  if (P.index < 0 || !current()) return;
  load(false, s.time || 0);
}

// ============ barra de reprodução (vidro, flutuante) ============
const art = (t, cls = '') => {
  const u = artUrl(t);
  const el = h('div.art' + (cls ? '.' + cls : ''));
  if (u) {
    const img = h('img', { src: u, draggable: false, onerror: () => img.remove() });
    el.append(img);
  }
  el.append(icon('note', 'ph'));
  return el;
};
export { art };

export function buildBar(host) {
  const shBtn = h('button.pb.small', { title: 'Aleatório', onclick: () => setShuffle(!S.data.settings.shuffle) }, icon('shuffle'));
  const prevBtn = h('button.pb', { title: 'Anterior', onclick: prev }, icon('prev'));
  const playBtn = h('button.pb.big', { title: 'Reproduzir (Espaço)', onclick: toggle }, icon('play'));
  const nextBtn = h('button.pb', { title: 'Seguinte', onclick: () => next() }, icon('next'));
  const repBtn = h('button.pb.small', { title: 'Repetir', onclick: cycleRepeat }, icon('repeat'));

  const lcdArt = h('button.lcd-art', { title: 'Abrir Tocando Agora', onclick: () => openNowPlaying() });
  const title = h('div.lcd-title');
  const sub = h('div.lcd-sub');
  const tl = h('span.lcd-t'), tr = h('span.lcd-t');
  const bar = scrubber();
  const lcdText = h('div.lcd-text', h('div.lcd-lines', title, sub), h('div.lcd-prog', tl, bar.el, tr));
  const lcd = h('div.lcd', lcdArt, lcdText, h('button.lcd-more', { title: 'Mais', onclick: e => trackMenu(current(), e.currentTarget) }, icon('more')));

  const volIc = h('button.pb.small', { title: 'Sem som', onclick: () => toggleMute() }, icon('vol'));
  const vol = slider(() => (aud().muted ? 0 : vol), setVolume);
  const lyrBtn = h('button.pb.small', { title: 'Letra (Ctrl+L)', onclick: () => togglePanel('lyrics') }, icon('lyrics'));
  const qBtn = h('button.pb.small', { title: 'A Seguir', onclick: () => togglePanel('queue') }, icon('queue'));

  const el = h('div.player.glass', h('div.ctrls', shBtn, prevBtn, playBtn, nextBtn, repBtn), lcd, h('div.right', volIc, vol.el, lyrBtn, qBtn));
  host.append(el);

  const paint = what => {
    const t = current();
    if (what === 'track' || what === 'init') {
      lcd.classList.toggle('empty', !t);
      lcdArt.replaceChildren(t ? art(t) : h('div.art', icon('note', 'ph')));
      title.textContent = t ? t.title : '';
      sub.replaceChildren(...(t ? [h('a', { onclick: () => import('./app.js').then(m => m.go({ view: 'artist', key: t.artistKey })) }, t.artist), t.album ? ' — ' : '', t.album ? h('a', { onclick: () => import('./app.js').then(m => m.go({ view: 'album', key: t.albumKey })) }, t.album) : ''] : []));
      document.title = t ? `${t.title} — ${t.artist}` : 'Música';
    }
    if (['state', 'track', 'init'].includes(what)) {
      playBtn.replaceChildren(icon(isPlaying() ? 'pause' : 'play'));
      playBtn.title = isPlaying() ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)';
      document.body.classList.toggle('is-playing', isPlaying());
    }
    if (['time', 'track', 'init'].includes(what)) {
      const d = aud().duration || current()?.dur || 0;
      tl.textContent = fmt.time(aud().currentTime);
      tr.textContent = '-' + fmt.time(d - aud().currentTime);
      bar.set(d ? aud().currentTime / d : 0);
    }
    if (['mode', 'init'].includes(what)) {
      shBtn.classList.toggle('on', S.data.settings.shuffle);
      const r = S.data.settings.repeat;
      repBtn.classList.toggle('on', r !== 'off');
      repBtn.replaceChildren(icon(r === 'one' ? 'repeat1' : 'repeat'));
    }
    if (['volume', 'init'].includes(what)) {
      vol.set(aud().muted ? 0 : vol);
      volIc.replaceChildren(icon(aud().muted || vol === 0 ? 'mute' : vol < 0.4 ? 'vol0' : 'vol'));
    }
  };
  onPlayer(paint);
  paint('init');
  paint('track');
}

/** barra de progresso arrastável (engrossa ao passar o mouse, como no Apple Music) */
function scrubber() {
  const fill = h('i');
  const el = h('div.scrub', h('div.track', fill));
  let drag = false;
  const at = e => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  el.addEventListener('pointerdown', e => { drag = true; el.setPointerCapture(e.pointerId); el.classList.add('drag'); fill.style.width = at(e) * 100 + '%'; });
  el.addEventListener('pointermove', e => drag && (fill.style.width = at(e) * 100 + '%'));
  el.addEventListener('pointerup', e => { if (!drag) return; drag = false; el.classList.remove('drag'); seek(at(e) * (aud().duration || 0)); });
  return { el, set: f => !drag && (fill.style.width = f * 100 + '%') };
}
export { scrubber };

function slider(get, set) {
  const fill = h('i');
  const el = h('div.vol', h('div.track', fill));
  let drag = false;
  const at = e => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  el.addEventListener('pointerdown', e => { drag = true; el.setPointerCapture(e.pointerId); set(at(e)); });
  el.addEventListener('pointermove', e => drag && set(at(e)));
  el.addEventListener('pointerup', () => (drag = false));
  el.addEventListener('wheel', e => { e.preventDefault(); set(get() - Math.sign(e.deltaY) * 0.05); }, { passive: false });
  return { el, set: f => (fill.style.width = f * 100 + '%') };
}

// ============ menu de música ============
export function trackMenu(t, at, extra = []) {
  if (!t) return;
  const ids = Array.isArray(t) ? t.map(x => x.id) : [t.id];
  const one = Array.isArray(t) ? null : t;
  import('./app.js').then(m => {
    menu([
      { label: 'Tocar em Seguida', icon: 'nextUp', run: () => { playNext(ids); toast('Vai tocar em seguida', 'nextUp'); } },
      { label: 'Tocar por Último', icon: 'last', run: () => { playLast(ids); toast('Adicionada ao fim da fila', 'last'); } },
      '-',
      { header: 'Adicionar à Playlist' },
      { label: 'Nova Playlist…', icon: 'plus', run: () => m.newPlaylist(ids) },
      ...S.data.playlists.slice(-6).reverse().map(p => ({ label: p.name, icon: 'playlist', run: () => m.addTo(p.id, ids) })),
      '-',
      one && { label: isLoved(one) ? 'Remover das Favoritas' : 'Favoritar', icon: isLoved(one) ? 'starFill' : 'star', run: () => toggleLove(ids) },
      one && { label: 'Ir para o Álbum', icon: 'album', run: () => m.go({ view: 'album', key: one.albumKey }) },
      one && { label: 'Ir para o Artista', icon: 'mic', run: () => m.go({ view: 'artist', key: one.artistKey }) },
      one && { label: 'Mostrar no Explorador', icon: 'explorer', run: () => api.reveal(one.id) },
      ...extra,
    ], at instanceof Element ? at : { x: at.clientX, y: at.clientY });
  });
}

// ============ letras ============
function parseLrc(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const tags = [...line.matchAll(/\[(\d+):(\d+(?:[.,]\d+)?)\]/g)];
    if (!tags.length) continue;
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) out.push([+m[1] * 60 + parseFloat(m[2].replace(',', '.')), words]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export async function getLyrics(t) {
  const c = S.data.lyrics[t.id];
  if (c && !(c.none && Date.now() - c.at > 7 * 864e5)) return c;
  let res = null;
  if (t.lyrics) {
    const raw = await api.embeddedLyrics(t.id).catch(() => null);
    if (raw) res = /\[\d+:\d+/.test(raw) ? { synced: parseLrc(raw), src: 'arquivo' } : { plain: raw, src: 'arquivo' };
  }
  if (!res && S.data.settings.lyricsOnline && navigator.onLine) {
    try {
      const q = new URLSearchParams({ track_name: t.title, artist_name: t.artist, album_name: t.album || '', duration: Math.round(t.dur) });
      let r = await fetch('https://lrclib.net/api/get?' + q);
      let j = r.ok ? await r.json() : null;
      if (!j) {
        r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ track_name: t.title, artist_name: t.artist }));
        const list = r.ok ? await r.json() : [];
        j = list.find(x => x.syncedLyrics) || list[0] || null;
      }
      if (j?.instrumental) res = { instrumental: true, src: 'LRCLIB' };
      else if (j?.syncedLyrics) res = { synced: parseLrc(j.syncedLyrics), src: 'LRCLIB' };
      else if (j?.plainLyrics) res = { plain: j.plainLyrics, src: 'LRCLIB' };
    } catch {}
  }
  S.data.lyrics[t.id] = res || { none: true, at: Date.now() };
  saveQuiet();
  return S.data.lyrics[t.id];
}

/** área de letra que acompanha a música; devolve {el, update} */
function lyricsView(big) {
  const el = h('div.lyr' + (big ? '.big' : ''));
  let lines = [], synced = null, curIdx = -2, forT = null, userScroll = 0;
  el.addEventListener('wheel', () => (userScroll = Date.now()), { passive: true });
  const show = async t => {
    forT = t;
    curIdx = -2;
    synced = null;
    if (!t) return el.replaceChildren(h('div.lyr-msg', 'Nada tocando'));
    el.replaceChildren(h('div.lyr-msg', 'Carregando letra…'));
    const L = await getLyrics(t);
    if (forT !== t) return;
    if (L.synced?.length) {
      synced = L.synced;
      lines = synced.map(([time, w]) => h('button.ln' + (w ? '' : '.gap'), { onclick: () => { seek(time); aud().play(); } }, w || '♪'));
      el.replaceChildren(h('div.lyr-pad'), ...lines, h('div.lyr-src', `Letra: ${L.src}`), h('div.lyr-pad'));
      el.scrollTop = 0;
      tick();
    } else if (L.plain) {
      el.replaceChildren(h('div.lyr-plain', L.plain), h('div.lyr-src', `Letra: ${L.src}`));
    } else if (L.instrumental) el.replaceChildren(h('div.lyr-msg', 'Instrumental'));
    else el.replaceChildren(h('div.lyr-msg', 'Letra indisponível', h('small', S.data.settings.lyricsOnline ? 'Não achamos a letra desta música.' : 'A busca de letras na internet está desligada nos Ajustes.')));
  };
  const tick = () => {
    if (!synced) return;
    const now = aud().currentTime + 0.25;
    let i = synced.findIndex(([tm]) => tm > now) - 1;
    if (i === -2) i = synced.length - 1;
    if (i === curIdx) return;
    curIdx = i;
    lines.forEach((l, k) => { l.classList.toggle('on', k === i); l.classList.toggle('past', k < i); });
    const cur = lines[Math.max(0, i)];
    if (cur && Date.now() - userScroll > 3000) el.scrollTo({ top: cur.offsetTop - el.clientHeight * 0.32, behavior: 'smooth' });
  };
  return { el, show, tick };
}

// ============ painéis laterais: Letra / A Seguir ============
let panel = null;
export function togglePanel(kind) {
  const host = $('#panel');
  if (panel?.kind === kind) {
    host.classList.remove('open');
    panel = null;
    document.body.classList.remove('panel-open');
    return;
  }
  panel = { kind };
  document.body.classList.add('panel-open');
  host.classList.add('open');
  host.replaceChildren();
  if (kind === 'lyrics') {
    const lv = lyricsView(false);
    host.append(h('div.pn-head', h('b', 'Letra'), h('button.gbtn.round', { onclick: () => togglePanel('lyrics') }, icon('close'))), lv.el);
    lv.show(current());
    panel.paint = what => { if (what === 'track') lv.show(current()); if (what === 'time') lv.tick(); };
  } else {
    let showHist = false;
    const body = h('div.q-body');
    const histBtn = h('button.gbtn.round', { title: 'Histórico', onclick: () => { showHist = !showHist; histBtn.classList.toggle('on', showHist); draw(); } }, icon('history'));
    const autoBtn = h('button.gbtn.round' + (S.data.settings.autoplay !== false ? '.on' : ''), { title: 'Reprodução Automática', onclick: () => { S.data.settings.autoplay = S.data.settings.autoplay === false; autoBtn.classList.toggle('on', S.data.settings.autoplay !== false); save(true); } }, icon('infinity'));
    host.append(h('div.pn-head', h('b', 'A Seguir'), h('div', { style: { display: 'flex', gap: '2px' } }, autoBtn, histBtn, h('button.gbtn.round', { onclick: () => togglePanel('queue') }, icon('close')))), body);
    const row = (t, i, cls = '') => {
      const r = h('div.q-row' + cls, { draggable: i != null, ondblclick: () => { if (i != null) { P.index = i; load(true); } } },
        art(t, 'sm'), h('div.q-t', h('b', t.title), h('span', t.artist)),
        i != null ? h('button.q-x', { title: 'Remover', onclick: e => { e.stopPropagation(); P.queue.splice(i, 1); P.base.splice(P.base.indexOf(t.id), 1); fire('queue'); } }, icon('minus')) : null);
      if (i != null) {
        r.addEventListener('dragstart', e => e.dataTransfer.setData('q', i));
        r.addEventListener('dragover', e => { e.preventDefault(); r.classList.add('over'); });
        r.addEventListener('dragleave', () => r.classList.remove('over'));
        r.addEventListener('drop', e => {
          e.preventDefault();
          const from = +e.dataTransfer.getData('q');
          const [id] = P.queue.splice(from, 1);
          P.queue.splice(from < i ? i - 1 : i, 0, id);
          fire('queue');
        });
      }
      return r;
    };
    const draw = () => {
      const t = current();
      if (showHist) {
        const hist = P.history.slice(-50).reverse().map(id => S.byId.get(id)).filter(Boolean);
        body.replaceChildren(h('div.q-sec', 'Histórico'), ...(hist.length ? hist.map(x => row(x, null)) : [h('div.lyr-msg.sm', 'Nada ainda')]));
        return;
      }
      const up = P.queue.slice(P.index + 1).map((id, k) => [S.byId.get(id), P.index + 1 + k]).filter(([x]) => x);
      body.replaceChildren(
        ...(t ? [h('div.q-sec', 'Tocando Agora'), row(t, null, '.now')] : []),
        h('div.q-sec', P.context ? `A Seguir · ${P.context}` : 'A Seguir'),
        ...(up.length ? up.slice(0, 300).map(([x, i]) => row(x, i)) : [h('div.lyr-msg.sm', 'A fila está vazia')]));
    };
    draw();
    panel.paint = what => (what === 'track' || what === 'queue') && draw();
  }
}
onPlayer(what => panel?.paint?.(what));

// ============ Tocando Agora (tela cheia) ============
let np = null;
export function openNowPlaying() {
  if (np || !current()) return;
  const bg = h('div.np-bg');
  const big = h('div.np-art');
  const title = h('div.np-title'), artist = h('div.np-artist');
  const star = h('button.gbtn.round', { title: 'Favoritar', onclick: () => { toggleLove([current().id]); paint('track'); } });
  const bar = scrubber();
  const tl = h('span'), tr = h('span');
  const playBtn = h('button.np-b.big', { onclick: toggle });
  const shBtn = h('button.np-b.sm', { title: 'Aleatório', onclick: () => setShuffle(!S.data.settings.shuffle) }, icon('shuffle'));
  const repBtn = h('button.np-b.sm', { title: 'Repetir', onclick: cycleRepeat });
  const vol = slider(volume, setVolume);
  const lv = lyricsView(true);
  const lyrBtn = h('button.np-b.sm', { title: 'Letra', onclick: () => { el.classList.toggle('no-lyr'); S.data.settings.npLyrics = !el.classList.contains('no-lyr'); saveQuiet(); } }, icon('lyrics'));
  const el = h('div.np' + (S.data.settings.npLyrics === false ? '.no-lyr' : ''),
    bg, h('div.np-shade'),
    h('button.np-close.gbtn.round', { title: 'Fechar (Esc)', onclick: closeNowPlaying }, icon('down')),
    h('div.np-main',
      h('div.np-left', big,
        h('div.np-info', h('div', title, artist), h('div.np-acts', star, h('button.gbtn.round', { onclick: e => trackMenu(current(), e.currentTarget) }, icon('more')))),
        h('div.np-prog', bar.el, h('div.np-times', tl, tr)),
        h('div.np-ctrls', shBtn, h('button.np-b', { onclick: prev }, icon('prev')), playBtn, h('button.np-b', { onclick: () => next() }, icon('next')), repBtn),
        h('div.np-vol', icon('vol0'), vol.el, icon('vol')),
        h('div.np-tools', lyrBtn, h('button.np-b.sm', { title: 'A Seguir', onclick: () => { closeNowPlaying(); togglePanel('queue'); } }, icon('queue')))),
      lv.el));
  document.body.append(el);
  const paint = what => {
    const t = current();
    if (!t) return closeNowPlaying();
    if (what === 'track' || what === 'init') {
      const u = artUrl(t);
      big.replaceChildren(art(t));
      bg.replaceChildren(...[0, 1, 2].map(k => h('div.blob.b' + k, u ? { style: { backgroundImage: `url("${u}")` } } : null)));
      if (!u) bg.style.background = 'linear-gradient(135deg, #3a3a3c, #111)';
      title.textContent = t.title;
      artist.textContent = [t.artist, t.album].filter(Boolean).join(' — ');
      star.replaceChildren(icon(isLoved(t) ? 'starFill' : 'star'));
      lv.show(t);
      if (u) artColor(u).then(c => c && el.style.setProperty('--np-tint', `rgb(${c.join(',')})`));
    }
    if (['state', 'track', 'init'].includes(what)) {
      playBtn.replaceChildren(icon(isPlaying() ? 'pause' : 'play'));
      el.classList.toggle('paused', !isPlaying());
    }
    if (['time', 'track', 'init'].includes(what)) {
      const d = aud().duration || t.dur;
      bar.set(d ? aud().currentTime / d : 0);
      tl.textContent = fmt.time(aud().currentTime);
      tr.textContent = '-' + fmt.time(d - aud().currentTime);
      lv.tick();
    }
    if (['mode', 'init'].includes(what)) {
      shBtn.classList.toggle('on', S.data.settings.shuffle);
      repBtn.classList.toggle('on', S.data.settings.repeat !== 'off');
      repBtn.replaceChildren(icon(S.data.settings.repeat === 'one' ? 'repeat1' : 'repeat'));
    }
    if (what === 'volume' || what === 'init') vol.set(volume());
  };
  np = { el, paint };
  onPlayer(paint);
  paint('init');
}
export function closeNowPlaying() {
  if (!np) return;
  const { el, paint } = np;
  P.listeners.delete(paint);
  np = null;
  el.classList.add('out');
  setTimeout(() => el.remove(), 420);
}
export const nowPlayingOpen = () => !!np;
