// Roda dentro de cada site aberto numa tela da Sala 3D (o fundo.js injeta só nos quadros diretos
// das abas da sala). Faz a ponte com o navegador da sala (public/js/navegador.js):
// - conta em que endereço e com que título a página está (a barra de endereço e a aba mostram),
//   na hora em que muda: o título por um observador e a troca de página sem recarregar (YouTube,
//   Gmail...) pela Navigation API do Chrome — antes era uma conferida a cada 600 ms;
// - obedece aos botões voltar e avançar da barra;
// - link que abriria aba nova vira aba nova do navegador da sala: target=_blank na frente,
//   Ctrl+clique e botão do meio por trás (como no Chrome);
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
  let marcado = false;
  const contar = () => {
    marcado = false;
    const chave = `${location.href}\n${document.title}`;
    if (chave === ultimo) return;
    ultimo = chave;
    avisar({ t: 'pagina', url: location.href, titulo: document.title || '' });
  };
  // junta as mudanças do mesmo instante (endereço e título costumam mudar juntos) num aviso só
  const logo = () => {
    if (marcado) return;
    marcado = true;
    setTimeout(contar, 30);
  };
  contar();
  addEventListener('load', logo);
  addEventListener('popstate', logo);
  addEventListener('hashchange', logo);
  window.navigation?.addEventListener('currententrychange', logo);
  if (document.head) new MutationObserver(logo).observe(document.head, { subtree: true, childList: true, characterData: true });
  setInterval(contar, 3000); // por garantia (título trocado fora do <head>, por exemplo)

  addEventListener('message', (e) => {
    if (e.source !== pai || typeof e.data?.sala3dCmd !== 'string') return;
    if (e.data.sala3dCmd === 'voltar') history.back();
    else if (e.data.sala3dCmd === 'avancar') history.forward();
  });

  const linkDe = (e) => {
    const a = e.target.closest?.('a[href]');
    return a && /^https?:/.test(a.href) ? a : null;
  };
  const abaNova = (e, url, fundo) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    avisar({ t: 'aba', url, fundo });
  };
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const a = linkDe(e);
    if (!a) return;
    if (e.ctrlKey || e.metaKey) abaNova(e, a.href, true);
    else if ((a.getAttribute('target') || '').toLowerCase() === '_blank') abaNova(e, a.href, false);
  }, true);
  document.addEventListener('auxclick', (e) => {
    if (e.defaultPrevented || e.button !== 1) return;
    const a = linkDe(e);
    if (a) abaNova(e, a.href, true);
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
  let mexeu = false;
  addEventListener('mousemove', (e) => {
    dx += e.movementX;
    dy += e.movementY;
    alt = e.altKey && !e.ctrlKey; // Ctrl+Alt é o AltGr
    if (mexeu) return;
    mexeu = true;
    requestAnimationFrame(() => {
      avisar({ t: 'mouse', dx, dy, alt });
      dx = 0;
      dy = 0;
      mexeu = false;
    });
  }, true);
  addEventListener('mousedown', () => avisar({ t: 'clique', desceu: true }), true);
  addEventListener('mouseup', () => avisar({ t: 'clique', desceu: false }), true);

  // Vídeo ou som tocando: pelos eventos da mídia, na hora (eles não sobem, mas passam pela janela
  // na captura). A conferida de vez em quando pega o que muda sem evento.
  let tocando = false;
  const midia = () => {
    const agora = [...document.querySelectorAll('video, audio')].some((m) => !m.paused && !m.muted && m.volume > 0);
    if (agora === tocando) return;
    tocando = agora;
    avisar({ t: 'midia', tocando });
  };
  for (const t of ['play', 'playing', 'pause', 'ended', 'emptied', 'volumechange']) addEventListener(t, midia, true);
  setInterval(midia, 5000);
})();
