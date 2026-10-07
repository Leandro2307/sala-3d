// Roda em todas as abas. Duas tarefas:
// 1) Marca a aba com um "capture handle" (sala3d-aba:<id>): quando ela é compartilhada pela
//    Sala 3D, o site lê essa marca no vídeo capturado e sabe qual aba controlar.
// 2) Na própria página da Sala 3D, faz a ponte entre o site e a extensão (postMessage <-> runtime).
(() => {
  if (window.__sala3dExt) return; // injetado duas vezes (instalação + carregamento)
  window.__sala3dExt = true;
  const VERSAO = chrome.runtime.getManifest().version;

  chrome.runtime.sendMessage({ tipo: 'meu-id' }, (r) => {
    if (chrome.runtime.lastError || !r?.aba) return;
    try {
      navigator.mediaDevices?.setCaptureHandleConfig?.({ handle: `sala3d-aba:${r.aba}`, exposeOrigin: false, permittedOrigins: ['*'] });
    } catch { /* página sem suporte (ex.: dentro de iframe) */ }
  });

  // A ponte só vale na Sala 3D (a página tem <meta name="sala3d">).
  const ehSala = () => !!document.querySelector('meta[name="sala3d"]');
  let vivo = 0;
  // diz ao site que a extensão está aqui, e se este site já foi liberado no ícone dela
  const avisar = () => chrome.runtime.sendMessage({ tipo: 'status' }, (r) => {
    if (chrome.runtime.lastError) return;
    // nativo: o ajudante para janelas/telas (nativo/instalar.bat) está instalado
    window.postMessage({ sala3dExt: 'oi', versao: VERSAO, liberado: !!r?.liberado, nativo: !!r?.nativo }, location.origin);
    // sala liberada: o fundo fica acordado, ouvindo os cookies dos sites das telas (login)
    if (r?.liberado && !vivo) vivo = setInterval(() => chrome.runtime.sendMessage({ tipo: 'vivo' }, () => void chrome.runtime.lastError), 20_000);
  });

  const PEDIDOS = ['entrada', 'soltar', 'aba-info', 'janela', 'janela-retomar', 'janela-soltar', 'abas'];
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || typeof e.data.sala3d !== 'string' || !ehSala()) return;
    const m = e.data;
    if (m.sala3d === 'ping') return avisar();
    if (PEDIDOS.includes(m.sala3d)) {
      chrome.runtime.sendMessage({ tipo: m.sala3d, aba: m.aba, abas: m.abas, alvo: m.alvo, ev: m.ev, id: m.id }, (r) => {
        if (chrome.runtime.lastError) return;
        if (m.id != null) window.postMessage({ sala3dExt: 'resposta', id: m.id, r }, location.origin);
      });
    }
  });

  // o fundo avisa quando o controle de uma aba caiu (o usuário fechou a barra amarela, por exemplo)
  chrome.runtime.onMessage.addListener((m) => {
    if (m?.tipo === 'status-mudou' && ehSala()) return avisar();
    if (m?.tipo === 'desligou' && ehSala()) window.postMessage({ sala3dExt: 'desligou', aba: m.aba, janela: !!m.janela, motivo: m.motivo }, location.origin);
    // a aba compartilhada abriu outra página: a sala mostra o site na barra de navegação
    if (m?.tipo === 'aba-mudou' && ehSala()) window.postMessage({ sala3dExt: 'aba-mudou', aba: m.aba, site: m.site, titulo: m.titulo }, location.origin);
    // Alt+Shift+S (ou o ícone) numa aba: a sala abre a captura dela, sem a barra do Chrome
    if (m?.tipo === 'capturar-aba' && ehSala()) window.postMessage({ sala3dExt: 'capturar-aba', streamId: m.streamId, aba: m.aba, site: m.site, titulo: m.titulo }, location.origin);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ehSala() && avisar());
  else if (ehSala()) avisar();
})();
