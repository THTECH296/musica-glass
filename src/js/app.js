// Música — casca do app: barra lateral, rotas e as telas da biblioteca.

import { api, native, artUrl } from './api.js';
import { $, h, icon, fmt, nf, norm, debounce, artColor } from './util.js';
import {
  S, save, onChange, loadData, setTracks, songs, albums, albumByKey, artists, artistByKey, genres, recentlyAdded,
  recentlyPlayed, topPlayed, lovedTracks, isLoved, toggleLove, playlistById, playlistTracks, createPlaylist, addToPlaylist,
  mixes, search,
} from './store.js';
import { menu, alertBox, prompt, confirmBox, sheet, toast, switchEl } from './ui.js';
import {
  P, play, playNext, onPlayer, current, buildBar, trackMenu, togglePanel, openNowPlaying, closeNowPlaying, nowPlayingOpen,
  toggle, next, prev, setVolume, aud, volume, restoreSession, art, seek,
} from './player.js';

const R = { route: { view: 'home' }, back: [], cleanup: [] };
window.__musica = { R, S, P };
const view = $('#view'), toolbar = $('#toolbar'), mainEl = $('#main');

// ============ tema e janela ============
function applyTheme() {
  const t = S.data.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try { localStorage.setItem('musica-theme', JSON.stringify(t)); } catch {}
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

function wireWindow() {
  const w = api.win;
  if (w) {
    document.documentElement.classList.add('win-frameless');
    $('.w-close').onclick = () => w.close();
    $('.w-min').onclick = () => w.minimize();
    $('.w-max').onclick = () => w.toggleMaximize();
    // maximizada ou em tela cheia, a janela encosta nas bordas da tela: cantos retos
    const sync = async () => {
      const [max, full] = await Promise.all([w.isMaximized(), w.isFullscreen()]);
      document.documentElement.classList.toggle('win-square', max || full);
      const b = $('.w-max');
      b.title = max ? 'Restaurar' : 'Maximizar';
      b.firstElementChild.innerHTML = max
        ? '<rect x="2" y="3.6" width="6.4" height="6.4" rx="1.6" /><path d="M4.2 2h4.2A1.6 1.6 0 0 1 10 3.6v4.2" />'
        : '<rect x="2" y="2" width="8" height="8" rx="2.2" />';
    };
    w.onResized(sync);
    sync();
  }
  $('#side-toggle').append(icon('sidebar'));
  $('#side-toggle').onclick = toggleSidebar;
  $('#search-ic').replaceWith(icon('search'));
  if (innerWidth < 820) document.body.classList.add('side-off');
}
function toggleSidebar() {
  document.body.classList.toggle('side-off');
  renderChrome();
}

// ============ navegação ============
export function go(route, push = true) {
  if (nowPlayingOpen()) closeNowPlaying();
  if (push && !same(route, R.route)) R.back.push({ route: R.route, scroll: view.querySelector('.scroller')?.scrollTop });
  if (!push) R.back = [];
  R.route = route;
  renderView();
  renderNav();
}
function goBack() {
  const b = R.back.pop();
  if (!b) return;
  R.route = b.route;
  renderView(b.scroll);
  renderNav();
}
const same = (a, b) => a.view === b.view && (a.key ?? a.id ?? a.name ?? a.q ?? '') === (b.key ?? b.id ?? b.name ?? b.q ?? '');

// ============ barra lateral ============
function navItem(ic, label, route, extra = {}) {
  const active = same(route, R.route) || (route.view === R.route.view && ['artists', 'albums', 'songs', 'genres', 'playlists'].includes(route.view));
  const el = h('button.nav-item' + (active ? '.active' : ''), { onclick: () => go(route, false), oncontextmenu: extra.menu }, icon(ic), h('span.lbl', label));
  if (extra.drop) {
    el.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/ids')) { e.preventDefault(); el.classList.add('drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drop'); extra.drop(JSON.parse(e.dataTransfer.getData('text/ids'))); });
  }
  return el;
}
function navSection(id, title, kids, extra) {
  const collapsed = S.data.collapsed?.[id];
  return h('div.nav-sec' + (collapsed ? '.collapsed' : ''),
    h('div.nav-head', h('span', title), h('span', { style: { display: 'flex', gap: '2px' } }, extra,
      h('button.chev', { onclick: () => { S.data.collapsed = { ...S.data.collapsed, [id]: !collapsed }; save(); } }, icon('down')))),
    h('div.nav-list', kids));
}
function renderNav() {
  const nav = $('#nav');
  const st = nav.scrollTop;
  nav.replaceChildren(
    h('div.nav-list', navItem('home', 'Início', { view: 'home' })),
    navSection('lib', 'Biblioteca', [
      navItem('clock', 'Adicionadas Recentemente', { view: 'recent' }),
      navItem('mic', 'Artistas', { view: 'artists' }),
      navItem('album', 'Álbuns', { view: 'albums' }),
      navItem('note', 'Músicas', { view: 'songs' }),
      navItem('genre', 'Gêneros', { view: 'genres' }),
    ]),
    navSection('pl', 'Playlists', [
      navItem('grid', 'Todas as Playlists', { view: 'playlists' }),
      navItem('star', 'Músicas Favoritas', { view: 'loved' }, { drop: ids => { toggleLove(ids, true); toast('Adicionada às Favoritas', 'starFill'); } }),
      navItem('chart', 'As 25 Mais Tocadas', { view: 'top' }),
      ...S.data.playlists.map(p => navItem('playlist', p.name, { view: 'playlist', id: p.id }, {
        drop: ids => addTo(p.id, ids),
        menu: e => { e.preventDefault(); playlistMenu(p, { x: e.clientX, y: e.clientY }); },
      })),
    ], h('button', { title: 'Nova Playlist', onclick: () => newPlaylist() }, icon('plus'))),
  );
  nav.scrollTop = st;
}

// ============ barra superior ============
function renderChrome(title = '') {
  const left = [];
  if (document.body.classList.contains('side-off')) left.push(h('div.pill.glass', h('button.gbtn.round', { title: 'Mostrar barra lateral', onclick: toggleSidebar }, icon('sidebar'))));
  if (R.back.length) left.push(h('div.pill.glass', h('button.gbtn.round', { title: 'Voltar', onclick: goBack }, icon('back'))));
  toolbar.replaceChildren(...left, h('div.tb-title', h('b', title), h('span', '')), h('div.drag', { 'data-tauri-drag-region': '' }));
}
function titleOnScroll(s, threshold = 60) {
  const t = toolbar.querySelector('.tb-title b');
  const upd = () => {
    if (t) t.style.opacity = s.scrollTop > threshold ? 1 : 0;
    mainEl.classList.toggle('scrolled', s.scrollTop > 8);
  };
  s.addEventListener('scroll', upd, { passive: true });
  upd();
}

// ============ telas ============
function clearView() {
  R.cleanup.forEach(f => f());
  R.cleanup = [];
  view.replaceChildren();
  mainEl.classList.remove('scrolled');
}
function scroller() {
  const s = h('div.scroller');
  view.append(s);
  return s;
}
const emptyState = (ic, title, text, action) => h('div.empty', h('div.box', icon(ic), h('h2', title), h('p', text), action));

function renderView(scroll) {
  clearView();
  const r = R.route;
  const titles = { home: 'Início', recent: 'Adicionadas Recentemente', artists: 'Artistas', albums: 'Álbuns', songs: 'Músicas', genres: 'Gêneros', playlists: 'Playlists', loved: 'Músicas Favoritas', top: 'As 25 Mais Tocadas', search: 'Buscar' };
  renderChrome(titles[r.view] || '');
  if (!S.tracks.length && !['playlists', 'playlist'].includes(r.view)) {
    view.append(emptyState('note', scanning ? 'Lendo suas músicas…' : 'Nenhuma Música', scanning ? 'Procurando na pasta do iTunes.' : 'Adicione a pasta onde ficam suas músicas.', scanning ? null : h('button.abtn.solid', { onclick: addFolder }, icon('plus'), 'Adicionar Pasta')));
    return;
  }
  const fn = VIEWS[r.view] || VIEWS.home;
  const s = fn(r);
  if (s && scroll != null) s.scrollTop = scroll;
}

const VIEWS = {
  home() {
    const s = scroller();
    const page = h('div.page', h('div.page-head', h('h1', 'Início')));
    const rp = recentlyPlayed();
    if (rp.length) page.append(sec('Tocadas Recentemente', null, h('div.hscroll', rp.slice(0, 14).map(albumCard))));
    page.append(sec('Feito para Você', null, h('div.hscroll', mixes().map(mixCard))));
    page.append(sec('Adicionadas Recentemente', () => go({ view: 'recent' }), h('div.hscroll', recentlyAdded().slice(0, 14).map(albumCard))));
    const ar = artists().slice().sort((a, b) => b.tracks.length - a.tracks.length);
    page.append(sec('Seus Artistas', () => go({ view: 'artists' }), h('div.hscroll', ar.slice(0, 14).map(artistCard))));
    const lv = lovedTracks();
    if (lv.length) page.append(sec('Músicas Favoritas', () => go({ view: 'loved' }), songTable(lv.slice(0, 6), { context: 'Favoritas', compact: true })));
    s.append(page);
    titleOnScroll(s);
    return s;
  },
  recent() {
    return gridPage('Adicionadas Recentemente', recentlyAdded());
  },
  albums() {
    return gridPage('Álbuns', albums(), fmt.albums(albums().length));
  },
  artists() {
    const s = scroller();
    const list = artists();
    s.append(h('div.page', h('div.page-head', h('div', h('h1', 'Artistas'), h('p', `${nf.format(list.length)} artistas`))), h('div.agrid', list.map(artistCard))));
    titleOnScroll(s);
    return s;
  },
  artist(r) {
    const a = artistByKey(r.key);
    if (!a) return VIEWS.artists();
    // iOS 27: a foto do artista se funde com a página, as cores dela tingem tudo e os botões ficam logo abaixo do nome
    const s = scroller();
    const u = artUrl(a.cover);
    const top = a.tracks.slice().sort((x, y) => (S.data.plays[y.id]?.n || 0) - (S.data.plays[x.id]?.n || 0) || x.title.localeCompare(y.title)).slice(0, 8);
    const latest = a.albums.slice().sort((x, y) => (y.year || 0) - (x.year || 0) || y.added - x.added)[0];
    const loved = !!S.data.lovedArtists?.[a.key];
    const starBtn = h('button.cbtn.glassy' + (loved ? '.on' : ''), { title: loved ? 'Remover dos Favoritos' : 'Favoritar Artista', onclick: () => {
      S.data.lovedArtists = { ...(S.data.lovedArtists || {}) };
      if (S.data.lovedArtists[a.key]) delete S.data.lovedArtists[a.key]; else S.data.lovedArtists[a.key] = Date.now();
      save(true);
      const on = !!S.data.lovedArtists[a.key];
      starBtn.classList.toggle('on', on);
      starBtn.replaceChildren(icon(on ? 'starFill' : 'star'));
      toast(on ? 'Artista favoritado' : 'Removido dos favoritos', on ? 'starFill' : 'star');
    } }, icon(loved ? 'starFill' : 'star'));
    const page = h('div.artist-page',
      h('div.ap-hero', u ? h('img.ap-img', { src: u, draggable: false }) : h('div.ap-img.none'),
        h('div.ap-head', h('h1', a.name),
          h('div.ap-btns',
            h('button.abtn.solid', { onclick: () => play(a.tracks, 0, { shuffle: false, context: a.name }) }, icon('play'), 'Reproduzir'),
            h('button.abtn.glassy', { onclick: () => play(a.tracks, 0, { shuffle: true, context: a.name }) }, icon('shuffle'), 'Aleatório'),
            starBtn,
            h('button.cbtn.glassy', { title: 'Sobre o artista', onclick: () => artistInfo(a) }, icon('info'))))),
      h('div.ap-body',
        latest ? h('section.sec', h('div.sec-head', h('h2', 'Em Destaque')), featuredBox(latest)) : null,
        sec('Essenciais', null, songTable(top, { context: a.name, compact: true })),
        sec(a.albums.length === 1 ? 'Álbum' : 'Álbuns', null, h('div.agrid', a.albums.map(albumCard)))));
    s.append(page);
    if (u) artColor(u).then(c => c && page.style.setProperty('--tint', `rgb(${c.join(',')})`));
    renderChrome(a.name);
    titleOnScroll(s, 300);
    return s;
  },
  album(r) {
    const a = albumByKey(r.key);
    if (!a) return VIEWS.albums();
    const s = scroller();
    tint(s, a.cover);
    s.append(hero({
      cover: art(a.cover), title: a.title, by: a.artist, byGo: () => go({ view: 'artist', key: norm(a.artist) }),
      meta: [a.genre, a.year || ''].filter(Boolean).join(' · '),
      play: sh => play(a.tracks, 0, { shuffle: sh, context: a.title }),
      more: e => trackMenu(a.tracks, e.currentTarget),
    }), songTable(a.tracks, { numbered: true, context: a.title, showArtist: a.tracks.some(t => t.artist !== a.artist) }),
    h('div.foot-note', `${fmt.songs(a.tracks.length)}, ${fmt.total(a.dur)}`));
    renderChrome(a.title);
    titleOnScroll(s, 260);
    return s;
  },
  songs() {
    const s = scroller();
    const list = songs();
    s.append(h('div.page', { style: { paddingBottom: '8px' } }, h('div.page-head', h('div', h('h1', 'Músicas'), h('p', `${fmt.songs(list.length)}, ${fmt.total(list.reduce((x, t) => x + t.dur, 0))}`)),
      h('div.btns', { style: { display: 'flex', gap: '10px' } }, h('button.abtn', { onclick: () => play(list, 0, { shuffle: false, context: 'Músicas' }) }, icon('play'), 'Reproduzir'), h('button.abtn', { onclick: () => play(list, 0, { shuffle: true, context: 'Músicas' }) }, icon('shuffle'), 'Aleatório')))),
      songTable(list, { context: 'Músicas', sortable: true }));
    titleOnScroll(s);
    return s;
  },
  genres() {
    const s = scroller();
    const pal = [['#fa2d48', '#a1146b'], ['#0a84ff', '#5e2ced'], ['#ff9f0a', '#ff375f'], ['#30d158', '#007a5e'], ['#bf5af2', '#4b1fa8'], ['#64d2ff', '#0a5ad6']];
    s.append(h('div.page', h('div.page-head', h('h1', 'Gêneros')), h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' } },
      genres().map((g, i) => {
        const u = artUrl(g.cover);
        return h('button.gcard' + (u ? '' : '.noimg'), { style: { '--c1': pal[i % pal.length][0], '--c2': pal[i % pal.length][1] }, onclick: () => go({ view: 'genre', name: g.name }) },
          u ? h('img', { src: u, loading: 'lazy' }) : null, h('div.t', h('b', g.name), h('span', fmt.songs(g.tracks.length))));
      }))));
    titleOnScroll(s);
    return s;
  },
  genre(r) {
    const g = genres().find(x => x.name === r.name);
    if (!g) return VIEWS.genres();
    return listPage(g.name, g.tracks, { cover: art(g.cover), meta: 'Gênero' });
  },
  playlists() {
    const s = scroller();
    const auto = [
      { title: 'Músicas Favoritas', sub: fmt.songs(lovedTracks().length), go: { view: 'loved' }, tracks: lovedTracks(), ic: 'star' },
      { title: 'As 25 Mais Tocadas', sub: 'Playlist inteligente', go: { view: 'top' }, tracks: topPlayed(), ic: 'chart' },
    ];
    s.append(h('div.page', h('div.page-head', h('div', h('h1', 'Playlists')), h('button.abtn', { onclick: () => newPlaylist() }, icon('plus'), 'Nova Playlist')),
      h('div.agrid',
        auto.map(p => h('button.acard', { onclick: () => go(p.go) }, h('div.cvw', collage(p.tracks, p.ic)), h('b', p.title), h('span', p.sub))),
        S.data.playlists.slice().reverse().map(p => h('button.acard', { onclick: () => go({ view: 'playlist', id: p.id }), oncontextmenu: e => { e.preventDefault(); playlistMenu(p, e); } },
          h('div.cvw', collage(playlistTracks(p), 'playlist')), h('b', p.name), h('span', fmt.songs(p.items.length)))))));
    titleOnScroll(s);
    return s;
  },
  playlist(r) {
    const p = playlistById(r.id);
    if (!p) return VIEWS.playlists();
    const tracks = playlistTracks(p);
    return listPage(p.name, tracks, {
      cover: collage(tracks, 'playlist'), meta: 'Playlist', editable: p, empty: ['playlist', 'Playlist vazia', 'Arraste músicas até esta playlist na barra lateral ou use “Adicionar à Playlist”.'],
      remove: ids => { p.items = p.items.filter(x => !ids.includes(x)); save(); },
      reorder: (from, to) => { const [x] = p.items.splice(from, 1); p.items.splice(from < to ? to - 1 : to, 0, x); save(); },
      more: e => playlistMenu(p, e.currentTarget),
    });
  },
  loved() {
    return listPage('Músicas Favoritas', lovedTracks(), { cover: collage(lovedTracks(), 'star'), meta: 'Playlist', empty: ['star', 'Nenhuma Favorita', 'Toque na estrela de uma música para ela aparecer aqui.'] });
  },
  top() {
    return listPage('As 25 Mais Tocadas', topPlayed(), { cover: collage(topPlayed(), 'chart'), meta: 'Playlist inteligente', numbered: true, empty: ['chart', 'Ouça algumas músicas', 'As que você mais tocar aparecem aqui.'] });
  },
  mix(r) {
    const m = mixes().find(x => x.id === r.id);
    if (!m) return VIEWS.home();
    return listPage(m.title, m.tracks, { cover: mixArt(m), meta: 'Feito para Você', desc: m.sub });
  },
  search(r) {
    const res = search(r.q || '');
    const s = scroller();
    const page = h('div.page', h('div.page-head', h('div', h('h1', 'Buscar'), h('p', `Resultados para “${r.q}”`))));
    if (!res || (!res.songs.length && !res.albums.length && !res.artists.length && !res.playlists.length)) {
      page.append(h('div.lyr-msg', { style: { paddingTop: '60px' } }, 'Nenhum resultado', h('small', 'Tente outro nome de música, artista ou álbum.')));
    } else {
      if (res.artists.length) page.append(sec('Artistas', null, h('div.hscroll', res.artists.slice(0, 14).map(artistCard))));
      if (res.albums.length) page.append(sec('Álbuns', null, h('div.hscroll', res.albums.slice(0, 20).map(albumCard))));
      if (res.playlists.length) page.append(sec('Playlists', null, h('div.hscroll', res.playlists.map(p => h('button.acard', { onclick: () => go({ view: 'playlist', id: p.id }) }, h('div.cvw', collage(playlistTracks(p), 'playlist')), h('b', p.name), h('span', fmt.songs(p.items.length)))))));
      if (res.songs.length) page.append(sec('Músicas', null, songTable(res.songs.slice(0, 200), { context: `Busca “${r.q}”`, compact: true })));
    }
    s.append(page);
    titleOnScroll(s);
    return s;
  },
};

function sec(title, more, ...kids) {
  return h('section.sec', h('div.sec-head', h('h2' + (more ? '.link' : ''), { onclick: more }, title, more ? icon('fwd') : null)), kids);
}

function gridPage(title, list, sub) {
  const s = scroller();
  s.append(h('div.page', h('div.page-head', h('div', h('h1', title), sub ? h('p', sub) : null)), h('div.agrid', list.map(albumCard))));
  titleOnScroll(s);
  return s;
}

function listPage(title, tracks, o) {
  const s = scroller();
  const total = tracks.reduce((x, t) => x + t.dur, 0);
  const head = hero({
    cover: o.cover, title, meta: o.meta, desc: o.desc, editable: o.editable,
    play: sh => tracks.length && play(tracks, 0, { shuffle: sh, context: title }),
    more: o.more,
  });
  s.append(head);
  if (!tracks.length && o.empty) s.append(h('div.lyr-msg', { style: { paddingTop: '40px' } }, o.empty[1], h('small', o.empty[2])));
  else s.append(songTable(tracks, { context: title, numbered: o.numbered, remove: o.remove, reorder: o.reorder }), h('div.foot-note', `${fmt.songs(tracks.length)}, ${fmt.total(total)}`));
  renderChrome(title);
  titleOnScroll(s, 260);
  return s;
}

function hero(o) {
  const t = h('h1', o.title);
  if (o.editable) {
    t.title = 'Clique para renomear';
    t.onclick = () => {
      t.contentEditable = 'true';
      t.focus();
      document.getSelection().selectAllChildren(t);
    };
    t.onblur = () => {
      t.contentEditable = 'false';
      const v = t.textContent.trim();
      if (v && v !== o.editable.name) { o.editable.name = v; save(); } else t.textContent = o.editable.name;
    };
    t.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } if (e.key === 'Escape') { t.textContent = o.editable.name; t.blur(); } };
  }
  return h('div.hero', o.cover,
    h('div.info', t, o.by ? h('a.by', { onclick: o.byGo }, o.by) : null, o.meta ? h('div.meta', o.meta) : null, o.desc ? h('div.desc', o.desc) : null,
      h('div.btns',
        h('button.abtn.solid', { onclick: () => o.play(false) }, icon('play'), 'Reproduzir'),
        h('button.abtn', { onclick: () => o.play(true) }, icon('shuffle'), 'Aleatório'),
        o.more ? h('button.cbtn', { title: 'Mais', onclick: o.more }, icon('more')) : null)));
}

// ---------- cartões ----------
function albumCard(a) {
  return h('button.acard', { onclick: () => go({ view: 'album', key: a.key }), oncontextmenu: e => { e.preventDefault(); trackMenu(a.tracks, e); } },
    h('div.cvw', art(a.cover),
      h('span.hov.pl.glass', { role: 'button', title: 'Reproduzir', onclick: e => { e.stopPropagation(); play(a.tracks, 0, { shuffle: false, context: a.title }); } }, icon('play')),
      h('span.hov.mo.glass', { role: 'button', title: 'Mais', onclick: e => { e.stopPropagation(); trackMenu(a.tracks, e.currentTarget); } }, icon('more'))),
    h('b', a.title), h('span', a.artist));
}
function artistCard(a) {
  return h('button.acard.artist-card', { onclick: () => go({ view: 'artist', key: a.key }) }, art(a.cover, 'round'), h('b', a.name), h('span', fmt.songs(a.tracks.length)));
}
function collage(tracks, ic) {
  const covers = [];
  const seen = new Set();
  for (const t of tracks) {
    const k = t.albumKey;
    if (seen.has(k) || !artUrl(t)) continue;
    seen.add(k);
    covers.push(t);
    if (covers.length === 4) break;
  }
  if (covers.length >= 4) return h('div.art', { style: { display: 'grid', gridTemplate: '1fr 1fr / 1fr 1fr' } }, covers.map(t => h('img', { src: artUrl(t), style: { position: 'static' } })));
  if (covers.length) return art(covers[0]);
  return h('div.art.mono', icon(ic, 'ph'));
}
/** fundo do mix tirado das capas (como as capas novas das playlists da Apple) */
function paintMix(el, m, covers) {
  el.style.setProperty('--c1', m.colors[0]);
  el.style.setProperty('--c2', m.colors[1]);
  const u = covers[0] && artUrl(covers[0]);
  if (!u) return;
  Promise.all([artColor(u), covers[1] ? artColor(artUrl(covers[1])) : null]).then(([a, b]) => {
    if (!a) return;
    const c2 = b || a.map(x => Math.round(x * 0.45));
    el.style.setProperty('--c1', `rgb(${a.join(',')})`);
    el.style.setProperty('--c2', `rgb(${c2.map(x => Math.round(x * 0.6)).join(',')})`);
  });
}
const mixCovers = m => [...new Map(m.tracks.filter(t => artUrl(t)).map(t => [t.albumKey, t])).values()].slice(0, 4);
function mixArt(m) {
  const covers = mixCovers(m);
  const el = h('div.art.mixart',
    covers.length >= 4 ? h('div.mos', covers.map(t => h('img', { src: artUrl(t) }))) : null,
    h('div.mt', h('span.logo', icon('note'), 'música'), h('b', m.title.replace(/^Mix /, ''))));
  paintMix(el, m, covers);
  return el;
}
function mixCard(m) {
  const covers = mixCovers(m);
  const el = h('button.mix', { onclick: () => go({ view: 'mix', id: m.id }) },
    h('div.grad'),
    covers.length >= 4 ? h('div.mos', covers.map(t => h('img', { src: artUrl(t) }))) : null,
    h('div.logo', icon('note'), 'música'),
    h('div.t', h('small', 'Mix'), h('b', m.title.replace(/^Mix /, '')), h('span', m.sub)));
  paintMix(el, m, covers);
  return el;
}

/** página tingida pelas cores da capa (álbum) */
function tint(s, cover) {
  s.classList.add('tinted');
  const u = artUrl(cover);
  if (u) artColor(u).then(c => c && s.style.setProperty('--tint', `rgb(${c.join(',')})`));
}

/** quadro "Em Destaque": o lançamento mais recente do artista */
function featuredBox(a) {
  return h('div.feat.glass', { onclick: () => go({ view: 'album', key: a.key }) },
    art(a.cover),
    h('div.feat-t',
      h('small', a.year ? `LANÇAMENTO DE ${a.year}` : 'LANÇAMENTO MAIS RECENTE'),
      h('b', a.title),
      h('span', `${a.single ? 'Single' : 'Álbum'} · ${fmt.songs(a.tracks.length)} · ${fmt.total(a.dur)}`),
      h('div.feat-btns',
        h('button.abtn.solid', { onclick: e => { e.stopPropagation(); play(a.tracks, 0, { shuffle: false, context: a.title }); } }, icon('play'), 'Reproduzir'))));
}

function artistInfo(a) {
  sheet((el, close) => {
    const plays = a.tracks.reduce((n, t) => n + (S.data.plays[t.id]?.n || 0), 0);
    const gen = [...new Set(a.tracks.map(t => t.genre).filter(Boolean))];
    const years = a.tracks.map(t => t.year).filter(Boolean);
    const row = (ic, label, val) => h('div.row', icon(ic), h('span.lbl', label), h('span.val', val));
    el.append(h('h2', a.name), h('p.sub', 'Na sua biblioteca'),
      h('div.grp',
        row('note', 'Músicas', nf.format(a.tracks.length)),
        row('album', 'Álbuns', nf.format(a.albums.length)),
        row('clock', 'Duração total', fmt.total(a.tracks.reduce((x, t) => x + t.dur, 0))),
        row('chart', 'Reproduções', nf.format(plays)),
        gen.length ? row('genre', 'Gêneros', gen.slice(0, 3).join(', ')) : null,
        years.length ? row('disc', 'Anos', Math.min(...years) === Math.max(...years) ? String(years[0]) : `${Math.min(...years)}–${Math.max(...years)}`) : null),
      h('div.foot', h('button.abtn.solid', { onclick: close }, 'OK')));
  });
}

// ---------- tabela de músicas ----------
let tables = [];
function songTable(tracks, o = {}) {
  let list = tracks.slice();
  let sort = o.sortable ? { key: 'title', dir: 1 } : null;
  const sel = new Set();
  let anchor = -1;
  const full = !o.numbered && !o.compact;
  const cols = o.numbered
    ? `28px minmax(0, 1fr) ${o.showArtist ? 'minmax(0, .6fr) ' : ''}24px 52px 28px`
    : o.compact ? 'minmax(0, 1.4fr) minmax(0, 1fr) 24px 52px 28px' : 'minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1fr) 24px 52px 28px';
  const wrap = h('div.songs', { style: { '--cols': cols } });
  const body = h('div');

  const head = () => {
    if (!o.sortable) return null;
    const col = (k, label) => h('button' + (sort.key === k ? '.on' : ''), { onclick: () => { sort = { key: k, dir: sort.key === k ? -sort.dir : 1 }; draw(); } }, label, sort.key === k ? icon(sort.dir > 0 ? 'down' : 'down', '') : null);
    return h('div.songs-head', col('title', 'Música'), col('artist', 'Artista'), col('album', 'Álbum'), h('span'), col('dur', 'Duração'), h('span'));
  };
  const playAt = i => play(list, i, { shuffle: false, context: o.context });
  const row = (t, i) => {
    const playing = current()?.id === t.id;
    const eq = () => h('span.eq', h('i'), h('i'), h('i'), h('i'));
    const pov = () => h('span.playov', { onclick: e => { e.stopPropagation(); playAt(i); } }, icon('play'));
    const star = h('button.star' + (isLoved(t) ? '.on' : ''), { title: 'Favoritar', onclick: e => { e.stopPropagation(); toggleLove([t.id]); star.classList.toggle('on', isLoved(t)); star.replaceChildren(icon(isLoved(t) ? 'starFill' : 'star')); } }, icon(isLoved(t) ? 'starFill' : 'star'));
    const link = (txt, route) => h('a', { onclick: e => { e.stopPropagation(); go(route); } }, txt);
    const cells = o.numbered
      ? [h('span.num', h('span', o.numbered === true && t.track && !o.remove ? t.track : i + 1), eq(), pov()), h('div.t', h('b', t.title), o.showArtist ? null : null), o.showArtist ? h('span.dim', link(t.artist, { view: 'artist', key: t.artistKey })) : null]
      : [h('div.lead', h('div.art', artUrl(t) ? h('img', { src: artUrl(t), loading: 'lazy', onerror: e => e.target.remove() }) : null, icon('note', 'ph ph-n'), eq(), pov()),
          h('div.t', h('b', t.title), full ? null : h('span.sub', link(t.artist, { view: 'artist', key: t.artistKey })))),
        full ? h('span.dim', link(t.artist, { view: 'artist', key: t.artistKey })) : h('span.dim', t.album ? link(t.album, { view: 'album', key: t.albumKey }) : ''),
        full ? h('span.dim', t.album ? link(t.album, { view: 'album', key: t.albumKey }) : '') : null];
    const r = h('div.srow' + (playing ? '.playing' : '') + (sel.has(t.id) ? '.sel' : ''), { dataset: { id: t.id, i }, draggable: true },
      ...cells, star, h('span.time', fmt.time(t.dur)),
      h('button.mo', { title: 'Mais', onclick: e => { e.stopPropagation(); rowMenu(t, i, e.currentTarget); } }, icon('more')));
    r.addEventListener('dblclick', () => playAt(i));
    r.addEventListener('click', e => {
      if (e.shiftKey && anchor >= 0) {
        const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
        for (let k = a; k <= b; k++) sel.add(list[k].id);
      } else if (e.ctrlKey || e.metaKey) sel.has(t.id) ? sel.delete(t.id) : sel.add(t.id);
      else { sel.clear(); sel.add(t.id); anchor = i; }
      if (!e.shiftKey) anchor = i;
      paintSel();
    });
    r.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (!sel.has(t.id)) { sel.clear(); sel.add(t.id); paintSel(); }
      rowMenu(t, i, e);
    });
    r.addEventListener('dragstart', e => {
      if (!sel.has(t.id)) { sel.clear(); sel.add(t.id); paintSel(); }
      e.dataTransfer.setData('text/ids', JSON.stringify([...sel]));
      e.dataTransfer.setData('text/from', String(i));
      e.dataTransfer.effectAllowed = 'copyMove';
    });
    if (o.reorder) {
      r.addEventListener('dragover', e => { e.preventDefault(); r.classList.add('drop'); });
      r.addEventListener('dragleave', () => r.classList.remove('drop'));
      r.addEventListener('drop', e => { e.preventDefault(); r.classList.remove('drop'); const from = +e.dataTransfer.getData('text/from'); if (!isNaN(from) && from !== i) o.reorder(from, i); });
    }
    return r;
  };
  const rowMenu = (t, i, at) => {
    const ids = sel.size > 1 && sel.has(t.id) ? [...sel] : [t.id];
    const many = ids.length > 1 ? ids.map(id => S.byId.get(id)) : t;
    trackMenu(many, at, [
      ids.length === 1 && { label: 'Reproduzir', icon: 'play', run: () => playAt(i) },
      o.remove && '-',
      o.remove && { label: ids.length > 1 ? `Remover ${ids.length} da Playlist` : 'Remover da Playlist', icon: 'minus', run: () => o.remove(ids) },
    ].filter(Boolean));
  };
  const paintSel = () => body.querySelectorAll('.srow').forEach(r => r.classList.toggle('sel', sel.has(r.dataset.id)));
  const draw = () => {
    if (sort) {
      const k = sort.key;
      list = tracks.slice().sort((a, b) => (k === 'dur' ? a.dur - b.dur : String(a[k] || '').localeCompare(String(b[k] || ''), 'pt-BR')) * sort.dir);
    }
    wrap.replaceChildren(...[head(), body].filter(Boolean));
    body.replaceChildren(...list.map(row));
  };
  draw();
  const api = {
    el: wrap,
    paintPlaying() {
      const id = current()?.id;
      body.querySelectorAll('.srow').forEach(r => r.classList.toggle('playing', r.dataset.id === id));
    },
    keys: e => {
      if (!sel.size) return false;
      if (e.key === 'Enter') { const i = list.findIndex(t => sel.has(t.id)); if (i >= 0) playAt(i); return true; }
      if (e.key === 'Delete' && o.remove) { o.remove([...sel]); return true; }
      return false;
    },
  };
  tables.push(api);
  R.cleanup.push(() => (tables = tables.filter(x => x !== api)));
  return wrap;
}
onPlayer(what => what === 'track' && tables.forEach(t => t.paintPlaying()));

// ============ playlists ============
export async function newPlaylist(ids = []) {
  const name = await prompt('Nova Playlist', '', 'Nome da playlist', 'Criar');
  if (name == null) return;
  const p = createPlaylist(name || 'Nova Playlist', ids);
  if (ids.length) toast(`Adicionada a “${p.name}”`, 'playlist');
  else go({ view: 'playlist', id: p.id });
}
export function addTo(pid, ids) {
  const n = addToPlaylist(pid, ids);
  const p = playlistById(pid);
  toast(n ? `${n === 1 ? 'Adicionada' : n + ' adicionadas'} a “${p.name}”` : `Já está em “${p.name}”`, 'playlist');
}
function playlistMenu(p, at) {
  menu([
    { label: 'Reproduzir', icon: 'play', run: () => play(playlistTracks(p), 0, { shuffle: false, context: p.name }) },
    { label: 'Aleatório', icon: 'shuffle', run: () => play(playlistTracks(p), 0, { shuffle: true, context: p.name }) },
    { label: 'Tocar em Seguida', icon: 'nextUp', run: () => playNext(p.items) },
    '-',
    { label: 'Renomear…', icon: 'edit', run: async () => { const n = await prompt('Renomear Playlist', p.name); if (n) { p.name = n; save(); } } },
    { label: 'Apagar Playlist', icon: 'trash', danger: true, run: async () => {
      if (!(await confirmBox(`Apagar “${p.name}”?`, 'As músicas continuam na sua biblioteca.', 'Apagar'))) return;
      S.data.playlists = S.data.playlists.filter(x => x !== p);
      save();
      if (R.route.view === 'playlist' && R.route.id === p.id) go({ view: 'playlists' }, false);
    } },
  ], at instanceof Element ? at : { x: at.x ?? at.clientX, y: at.y ?? at.clientY });
}

// ============ busca ============
const searchInput = $('#search');
searchInput.addEventListener('input', debounce(() => {
  const q = searchInput.value.trim();
  if (q) {
    if (R.route.view === 'search') { R.route.q = q; renderView(); } else go({ view: 'search', q });
  } else if (R.route.view === 'search') goBack();
}, 200));
searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { searchInput.value = ''; searchInput.dispatchEvent(new Event('input')); searchInput.blur(); } });

// ============ pastas, indexação e ajustes ============
let scanning = false, progressEl;
async function rescan(show) {
  if (scanning) return;
  scanning = true;
  if (!S.tracks.length) renderView();
  if (show) showProgress(0, 0);
  try {
    setTracks(await api.scan(S.data.folders));
  } finally {
    scanning = false;
    progressEl?.classList.add('out');
    lastScan = Date.now();
  }
}
let lastScan = 0;
api.on('scan-progress', ([d, t]) => { if (scanning && t > 100 && d < t) showProgress(d, t); });
function showProgress(done, total) {
  if (!progressEl) mainEl.append((progressEl = h('div.progress.glass', h('span', 'Lendo músicas'), h('div.bar', h('i')), h('span.n'))));
  progressEl.classList.remove('out');
  progressEl.querySelector('i').style.width = total ? (done / total) * 100 + '%' : '10%';
  progressEl.querySelector('.n').textContent = total ? `${nf.format(done)} de ${nf.format(total)}` : '';
}
async function addFolder() {
  const f = await api.pickFolder();
  if (!f || S.data.folders.includes(f)) return;
  S.data.folders.push(f);
  save();
  rescan(true);
}
function settings() {
  sheet((el, close) => {
    const st = S.data.settings;
    const folders = h('div.grp');
    const drawF = () => folders.replaceChildren(
      ...S.data.folders.map(f => h('div.row', icon('folder'), h('span.lbl', { title: f }, f),
        h('button.gbtn.round', { title: 'Abrir', onclick: () => api.openPath(f) }, icon('explorer')),
        h('button.gbtn.round', { title: 'Remover', style: { color: 'var(--red)' }, onclick: () => { S.data.folders = S.data.folders.filter(x => x !== f); save(); drawF(); rescan(true); } }, icon('minus')))),
      h('button.row', { onclick: async () => { await addFolder(); drawF(); } }, icon('plus'), h('span.lbl', { style: { color: 'var(--accent)' } }, 'Adicionar Pasta…')));
    drawF();
    const theme = h('div.segsmall', [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) =>
      h('button' + (st.theme === v ? '.on' : ''), { onclick: e => { st.theme = v; save(true); applyTheme(); [...e.target.parentNode.children].forEach(b => b.classList.toggle('on', b === e.target)); } }, l)));
    el.append(h('h2', 'Ajustes'), h('p.sub', `${fmt.songs(S.tracks.length)}, ${fmt.albums(albums().length)} na biblioteca`),
      h('div.grp-t', 'Pastas de Música'), folders,
      h('div.grp-t', 'Geral'),
      h('div.grp',
        h('div.row', icon('gear'), h('span.lbl', 'Aparência'), theme),
        h('div.row', icon('lyrics'), h('span.lbl', 'Buscar letras na internet (LRCLIB)'), switchEl(st.lyricsOnline, v => { st.lyricsOnline = v; save(true); })),
        h('div.row', icon('infinity'), h('span.lbl', 'Reprodução automática ao fim da fila'), switchEl(st.autoplay !== false, v => { st.autoplay = v; save(true); })),
        h('div.row', icon('shuffle'), h('span.lbl', 'AutoMix (transição suave entre músicas)'), switchEl(st.automix !== false, v => { st.automix = v; save(true); }))),
      h('div.foot', h('button.gbtn', { onclick: () => { close(); rescan(true); } }, 'Ler Pastas de Novo'), h('button.abtn.solid', { onclick: close }, 'OK')));
  });
}

// ============ fundo ambiente ============
function ambient() {
  const pick = recentlyAdded().filter(a => artUrl(a.cover)).slice(0, 6);
  $('#ambient').replaceChildren(...pick.map(a => h('img', { src: artUrl(a.cover) })));
}

// ============ atalhos ============
document.addEventListener('keydown', e => {
  if (document.querySelector('.alert, .sheet, .menu')) return;
  const typing = e.target.matches?.('input, textarea, [contenteditable="true"]');
  if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); if (document.body.classList.contains('side-off')) toggleSidebar(); searchInput.focus(); return; }
  if (typing) return;
  if (e.key === ' ') { e.preventDefault(); toggle(); }
  else if (e.ctrlKey && e.key === 'ArrowRight') next();
  else if (e.ctrlKey && e.key === 'ArrowLeft') prev();
  else if (e.ctrlKey && e.key === 'ArrowUp') { e.preventDefault(); setVolume(volume() + 0.1); }
  else if (e.ctrlKey && e.key === 'ArrowDown') { e.preventDefault(); setVolume(volume() - 0.1); }
  else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) togglePanel('lyrics');
  else if (e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')) toggleSidebar();
  else if (e.ctrlKey && e.key === ',') settings();
  else if (e.key === 'Escape' && nowPlayingOpen()) closeNowPlaying();
  else if (e.key === 'ArrowRight' && !e.ctrlKey && nowPlayingOpen()) seek(aud().currentTime + 10);
  else if (e.key === 'ArrowLeft' && !e.ctrlKey && nowPlayingOpen()) seek(aud().currentTime - 10);
  else if (tables.some(t => t.keys(e))) e.preventDefault();
  else if (e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft')) goBack();
});
window.addEventListener('mouseup', e => { if (e.button === 3) goBack(); });

// atualiza a tela quando a biblioteca muda (sem perder a rolagem)
let pending = false;
onChange(() => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    renderNav();
    if (document.activeElement?.isContentEditable) return;
    renderView(view.querySelector('.scroller')?.scrollTop);
  });
});

export const app = { go, settings };

async function boot() {
  wireWindow();
  await loadData();
  applyTheme();
  if (!S.data.folders.length) {
    S.data.folders = await api.defaultFolders();
    save(true);
  }
  buildBar($('#bottom'));
  const cached = await api.cachedIndex();
  setTracks(cached);
  restoreSession();
  renderNav();
  renderView();
  ambient();
  api.win?.show();
  // menu "…" da barra lateral: ajustes e reler pastas
  $('.side-top').append(h('button.gbtn.round', { title: 'Ajustes (Ctrl+,)', onclick: settings }, icon('gear')));
  await rescan(!cached.length);
  ambient();
  if (native) window.addEventListener('focus', () => Date.now() - lastScan > 120e3 && rescan(false));
}
boot();
