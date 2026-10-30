# Música Glass

Um app de música no estilo do Apple Music (iOS 27) para Windows, que toca as músicas da sua pasta do iTunes.

> Projeto independente e sem fins lucrativos. Não tem relação com a Apple. "iPhone", "iOS" e "Apple Music" são marcas da Apple Inc.

## Baixar e instalar

1. Abra a página de [**Releases**](https://github.com/THTECH296/musica-glass/releases/latest).
2. Baixe **`Musica-Glass-Setup-x64.exe`**.
3. Abra o arquivo. Ele instala só para o seu usuário, sem pedir senha de administrador.

Requisitos: Windows 10 ou 11, 64 bits. O WebView2 já vem no Windows 11; no Windows 10, o instalador baixa se faltar.

Para desinstalar: **Configurações → Aplicativos → Aplicativos instalados → Música → Desinstalar**.

## O que ele faz

- Lê a pasta **Música\iTunes** (e outras que você adicionar) com título, artista, álbum e capa de cada arquivo.
- **Início** com Tocadas Recentemente, mixes "Feito para Você", Adicionadas Recentemente e Seus Artistas.
- **Artistas, Álbuns, Músicas e Gêneros**, com páginas tingidas pelas cores da capa, como no iOS 27.
- **Playlists**: crie, renomeie, arraste músicas e reordene. Também tem Músicas Favoritas e As 25 Mais Tocadas, que se montam sozinhas.
- **Tocando Agora** em tela cheia com fundo animado e **letra sincronizada**.
- **AutoMix** (transição suave entre músicas), aleatório, repetir, fila "A Seguir" e reprodução automática.
- Funciona com as **teclas de mídia** e o painel de mídia do Windows.
- Toca MP3, AAC/M4A, FLAC, WAV e OGG.

## Como saber se o instalador é seguro

- **O código é aberto.** Tudo o que o app faz está neste repositório.
- **Quem compila é o GitHub, não uma pessoa.** O instalador de cada versão é gerado pelo [GitHub Actions](https://github.com/THTECH296/musica-glass/actions) direto deste código ([`.github/workflows/release.yml`](.github/workflows/release.yml)). Ninguém sobe um .exe feito à mão.
- **Atestado de origem.** Cada instalador tem um atestado assinado pelo GitHub dizendo de qual commit ele saiu. Para conferir, com o [GitHub CLI](https://cli.github.com) instalado:

  ```
  gh attestation verify Musica-Glass-Setup-x64.exe --repo THTECH296/musica-glass
  ```

- **SHA-256.** O arquivo `SHA256SUMS.txt` de cada Release traz o código de conferência. No PowerShell:

  ```
  Get-FileHash .\Musica-Glass-Setup-x64.exe -Algorithm SHA256
  ```

  O resultado tem que ser igual ao do `SHA256SUMS.txt`.

### "O Windows protegeu o computador"

O instalador ainda não tem assinatura digital paga (certificado de código). Por isso o SmartScreen pode avisar que o app é de um "editor desconhecido". Se você baixou da página de Releases deste repositório e conferiu o SHA-256 ou o atestado, clique em **Mais informações → Executar assim mesmo**.

## Privacidade

Seus arquivos não saem do seu computador. Os dados do app (índice, favoritos, playlists e ajustes) ficam em `%LOCALAPPDATA%\br.com.musica.desktop`. O app só usa a internet para:

- **Letras**: o título, artista, álbum e duração da música que está tocando são enviados ao LRCLIB (lrclib.net) para buscar a letra. Dá para desligar em Ajustes.

## Compilar a partir do código

Precisa de [Node.js](https://nodejs.org) 20+ e [Rust](https://rustup.rs).

```
npm ci
npx tauri build
```

O instalador fica em `src-tauri/target/release/bundle/nsis/`.

## Licença

[MIT](LICENSE). Componentes de terceiros: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
