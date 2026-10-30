// Ponte com o Rust. No navegador comum entra um modo demonstração (capas de exemplo, sem áudio).

const T = window.__TAURI__;
export const native = !!T;
const invoke = (cmd, args) => T.core.invoke(cmd, args);

export const api = {
  async loadState() {
    if (native) return invoke('load_state');
    try { return JSON.parse(localStorage.getItem('musica-demo') || 'null'); } catch { return null; }
  },
  saveState(state) {
    if (native) return invoke('save_state', { state });
    try { localStorage.setItem('musica-demo', JSON.stringify(state)); } catch {}
  },
  defaultFolders: () => (native ? invoke('default_folders') : Promise.resolve(['C:\\Users\\Demo\\Music\\iTunes'])),
  cachedIndex: () => (native ? invoke('cached_index') : Promise.resolve(demo())),
  scan: folders => (native ? invoke('scan_library', { folders }) : Promise.resolve(demo())),
  pickFolder: () => (native ? invoke('pick_folder') : Promise.resolve(null)),
  reveal: id => native && invoke('reveal', { id }),
  openPath: path => native && invoke('open_path', { path }),
  embeddedLyrics: id => (native ? invoke('embedded_lyrics', { id }) : Promise.resolve(null)),
  on(event, fn) {
    if (native) T.event.listen(event, e => fn(e.payload));
  },
  win: native ? T.window.getCurrentWindow() : null,
};

export const artUrl = t => (!t ? '' : native ? (t.art ? `http://capa.localhost/${t.id}` : '') : `https://picsum.photos/seed/${encodeURIComponent(t.album || t.id)}/600/600`);
export const audioUrl = t => (native ? `http://audio.localhost/${t.id}` : '');

// ---------- demonstração ----------
let D;
function demo() {
  if (D) return D;
  const albums = [
    ['Evanescence', 'Fallen', 'Rock', 2003, ['Going Under', 'Bring Me To Life', 'Everybody\'s Fool', 'My Immortal', 'Haunted', 'Tourniquet']],
    ['Linkin Park', 'Minutes to Midnight', 'Rock', 2007, ['Wake', 'Given Up', 'Leave Out All the Rest', 'Bleed It Out', 'Shadow of the Day', 'What I\'ve Done']],
    ['Racionais MC\'s', 'Nada Como um Dia Após o Outro Dia', 'Hip-Hop', 2002, ['Jesus Chorou', 'Negro Drama', 'Vida Loka, Pt. II', 'A Vítima', 'Estilo Cachorro']],
    ['Bon Jovi', 'Slippery When Wet', 'Rock', 1986, ['Let It Rock', 'You Give Love a Bad Name', 'Livin\' On A Prayer', 'Wanted Dead or Alive']],
    ['Iron Maiden', 'Fear of the Dark', 'Metal', 1992, ['Be Quick or Be Dead', 'Afraid to Shoot Strangers', 'Fear of the Dark']],
    ['Bonobo', 'Fragments', 'Eletrônica', 2022, ['Polyghost', 'Rosewood', 'Shadows', 'Otomo', 'Tides']],
    ['FISHER', 'World Hold On', 'Eletrônica', 2023, ['World Hold On (Children Of The Sky) - FISHER Rework']],
    ['Matuê', 'Máquina do Tempo', 'Trap', 2020, ['Kenny G', 'Antes', '777-666', 'É Sal', 'Groupies', 'Mantém']],
  ];
  const out = [];
  let n = 0;
  for (const [artist, album, genre, year, songs] of albums) {
    songs.forEach((title, i) => {
      out.push({ id: 'd' + n, path: `C:\\Users\\Demo\\Music\\iTunes\\${title}.mp3`, title, artist, album, albumArtist: artist, genre, year, track: i + 1, disc: 1, dur: 150 + ((n * 37) % 200), bitrate: 320, size: 8e6, mtime: 0, added: Date.now() / 1000 - n * 40000, art: true, lyrics: false, fmt: 'MP3' });
      n++;
    });
  }
  return (D = out);
}
