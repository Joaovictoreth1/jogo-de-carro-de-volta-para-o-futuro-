# DeLorean: corrida 3D

Jogo de corrida 3D com Three.js. Use as setas ou A/D para mover, P/Esc para pausar e M para silenciar; em telas táteis, use os controles da tela. O áudio começa após interação. Requer WebGL e conexão para carregar Three.js.

## Rodar localmente

Na raiz do repositório, execute:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Abra <http://localhost:8000/>.

## Estrutura

`front do site.html`: jogo, controles e áudio. `index.html`: entrada que preserva a URL original.

A CI valida o HTML e verifica arquivos e âncoras locais. Links e serviços externos não são consultados pela CI.
