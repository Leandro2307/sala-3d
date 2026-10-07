// Roda dentro de cada site aberto numa tela da Sala 3D (o fundo.js injeta só nos quadros diretos
// das abas da sala). Faz a ponte com o navegador da sala (public/js/navegador.js):
// - conta em que endereço e com que título a página está (a barra de endereço e a aba mostram);
// - obedece aos botões voltar e avançar da barra;
// - link que abriria aba nova (target=_blank, Ctrl+clique) vira aba nova do navegador da sala;
// - repassa teclas e mouse, para o teclado e o mouse do posto se mexerem junto. Em campo de
//   senha vai só "uma tecla" (sem dizer qual);
// - Alt+← / Alt+→ passa para a tela do lado (o monitor vizinho do posto), em vez de voltar página;
//   Alt + mouse para o lado também (a sala decide, com o Alt que vai junto no mouse). O Alt sozinho
//   não leva o foco para o menu do Chrome ao soltar;
// - conta se a página está tocando vídeo ou som (aba assim não é descarregada quando escondida).
(() => {
  if (window.__sala3dQuadro || window.top === window || window.parent !== window.top) return;
  window.__sala3dQuadro = true;
  const pai = window.parent;
  const avisar = (m) => pai.postMessage({ sala3dQuadro: m }, '*');

  let ultimo = '';
  const contar = () => {
    const chave = `${location.href}\n${document.title}`;
    if (chave === ultimo) return;
    ultimo = chave;
    avisar({ t: 'pagina', url: location.href, titulo: document.title || '' });
  };
  contar();
  addEventListener('load', contar);
  addEventListener('popstate', contar);
  addEventListener('hashchange', contar);
  setInterval(contar, 600); // sites que trocam de página sem recarregar (YouTube, Gmail...)

  addEventListener('message', (e) => {
    if (e.source !== pai || typeof e.data?.sala3dCmd !== 'string') return;
    if (e.data.sala3dCmd === 'voltar') history.back();
    else if (e.data.sala3dCmd === 'avancar') history.forward();
  });

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = e.target.closest?.('a[href]');
    if (!a || !/^https?:/.test(a.href)) return;
    const novaAba = (a.getAttribute('target') || '').toLowerCase() === '_blank' || e.ctrlKey || e.metaKey;
    if (!novaAba) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    avisar({ t: 'aba', url: a.href });
  }, true);

  const tecla = (desceu) => (e) => {
    if (desceu && e.altKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      avisar({ t: 'trocarTela', lado: e.code === 'ArrowRight' ? 1 : -1 });
      return;
    }
    if (e.key === 'Alt') e.preventDefault();
    const senha = e.target?.type === 'password';
    avisar({ t: 'tecla', code: senha ? null : e.code, desceu });
  };
  addEventListener('keydown', tecla(true), true);
  addEventListener('keyup', tecla(false), true);
  let dx = 0;
  let dy = 0;
  let alt = false;
  let marcado = false;
  addEventListener('mousemove', (e) => {
    dx += e.movementX;
    dy += e.movementY;
    alt = e.altKey && !e.ctrlKey; // Ctrl+Alt é o AltGr
    if (marcado) return;
    marcado = true;
    requestAnimationFrame(() => {
      avisar({ t: 'mouse', dx, dy, alt });
      dx = 0;
      dy = 0;
      marcado = false;
    });
  }, true);
  addEventListener('mousedown', () => avisar({ t: 'clique', desceu: true }), true);
  addEventListener('mouseup', () => avisar({ t: 'clique', desceu: false }), true);
  addEventListener('wheel', (e) => avisar({ t: 'roda', dy: e.deltaY }), { capture: true, passive: true });

  let tocando = false;
  setInterval(() => {
    const agora = [...document.querySelectorAll('video, audio')].some((m) => !m.paused && !m.muted && m.volume > 0);
    if (agora === tocando) return;
    tocando = agora;
    avisar({ t: 'midia', tocando });
  }, 1500);
})();
