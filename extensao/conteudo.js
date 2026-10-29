// Roda em todas as abas. Duas tarefas:
// 1) Marca a aba com um "capture handle" (sala3d-aba:<id>): quando ela é compartilhada pela
//    Sala 3D, o site lê essa marca no vídeo capturado e sabe qual aba controlar.
// 2) Na própria página da Sala 3D, faz a ponte entre o site e a extensão (postMessage <-> runtime).
//
// Extensão atualizada com a página aberta: o script de antes fica órfão (o Chrome corta a ligação
// dele com a extensão) e o fundo injeta este de novo. Injetado duas vezes na mesma versão, o
// segundo para aqui; de versão para versão, o novo desliga os ouvintes do antigo e assume — a sala
// segue funcionando sem recarregar.
(() => {
  const VERSAO = chrome.runtime.getManifest().version;
  const ligado = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  const antes = window.__sala3dExt;
  if (antes?.versao === VERSAO && antes.ligado?.()) return;
  antes?.parar?.();
  window.__sala3dExt = { versao: VERSAO, ligado, parar };

  chrome.runtime.sendMessage({ tipo: 'meu-id' }, (r) => {
    if (chrome.runtime.lastError || !r?.aba) return;
    try {
      navigator.mediaDevices?.setCaptureHandleConfig?.({ handle: `sala3d-aba:${r.aba}`, exposeOrigin: false, permittedOrigins: ['*'] });
    } catch { /* página sem suporte (ex.: dentro de iframe) */ }
  });

  // A ponte só vale na Sala 3D: a página tem <meta name="sala3d" content="<protocolo>">. No
  // protocolo 2 a sala responde aos pedidos do fundo (o resultado do Alt+Shift+S vai para o ícone).
  const meta = () => document.querySelector('meta[name="sala3d"]');
  const ehSala = () => !!meta();
  const protocolo = () => Number(meta()?.content) || 1;

  // mensagem para o fundo; com a extensão desligada ou atualizada, este script sai de cena
  const mandar = (m, resposta) => {
    if (!ligado()) return parar();
    try {
      chrome.runtime.sendMessage(m, (r) => {
        if (chrome.runtime.lastError) return;
        resposta?.(r);
      });
    } catch {
      parar();
    }
  };

  let vivo = 0;
  // Diz ao site que a extensão está aqui, se este site já foi liberado no ícone dela, qual é o
  // atalho de mostrar uma aba sem a faixa ('' = sem atalho) e o que se sabe do ajudante do Windows.
  const avisar = () => mandar({ tipo: 'status' }, (r) => {
    window.postMessage({ sala3dExt: 'oi', versao: VERSAO, liberado: !!r?.liberado, nativo: r?.nativo ?? null, atalho: r?.atalho ?? null }, location.origin);
    // sala liberada: o fundo fica acordado, ouvindo os cookies dos sites das telas (login)
    if (r?.liberado && !vivo) vivo = setInterval(() => mandar({ tipo: 'vivo' }), 20_000);
  });

  // porta fixa até o fundo para o movimento do modo jogo (reabre se o fundo dormir)
  let porta = null;
  const rapida = (m) => {
    if (!ligado()) return parar();
    try {
      if (!porta) {
        porta = chrome.runtime.connect({ name: 'sala3d-rapida' });
        porta.onDisconnect.addListener(() => { porta = null; });
      }
      porta.postMessage(m);
    } catch {
      porta = null;
    }
  };

  const PEDIDOS = ['entrada', 'soltar', 'aba-info', 'janela', 'janela-retomar', 'janela-soltar', 'abas', 'mostrar-sala', 'nativo-conferir'];
  const esperando = new Map(); // pedido -> responder: o fundo esperando a sala responder
  const aoSite = (e) => {
    if (e.source !== window || !e.data || typeof e.data.sala3d !== 'string' || !ehSala()) return;
    const m = e.data;
    if (m.sala3d === 'ping') return avisar();
    if (m.sala3d === 'resposta-pedido') {
      const responder = esperando.get(m.pedido);
      esperando.delete(m.pedido);
      return responder?.(m.r && typeof m.r === 'object' ? m.r : { ok: true });
    }
    // modo jogo: o movimento do mouse vai pela porta fixa, sem resposta (ver fundo.js)
    if (m.sala3d === 'janela-rapida') return rapida({ tipo: 'janela', alvo: m.alvo, ev: m.ev });
    if (PEDIDOS.includes(m.sala3d)) {
      mandar({ tipo: m.sala3d, aba: m.aba, abas: m.abas, alvo: m.alvo, ev: m.ev, id: m.id }, (r) => {
        if (m.id != null) window.postMessage({ sala3dExt: 'resposta', id: m.id, r }, location.origin);
      });
    }
  };
  addEventListener('message', aoSite);

  // Pedido do fundo que a sala responde. A sala de antes do protocolo 2 não responde: a captura vai
  // sem esperar (como sempre foi), e tirar a aba pelo atalho ela nem conhece.
  let seqPedido = 0;
  const pedirASala = (tipo, dados, responder) => {
    if (protocolo() < 2) {
      if (tipo === 'parar-aba') return void responder({ erro: 'sala-antiga' });
      window.postMessage({ sala3dExt: tipo, ...dados }, location.origin);
      return void responder({ ok: true });
    }
    const pedido = ++seqPedido;
    esperando.set(pedido, responder);
    window.postMessage({ sala3dExt: tipo, ...dados, pedido }, location.origin);
    // escolher a tela (no escritório) pode levar um tempo; sem resposta nenhuma, desiste
    setTimeout(() => {
      if (esperando.delete(pedido)) responder({ erro: 'sem-resposta' });
    }, 180_000);
    return true; // a resposta vem depois
  };

  const aoFundo = (m, _de, responder) => {
    if (!m || !ehSala()) return;
    if (m.tipo === 'status-mudou') avisar();
    // o controle de uma aba caiu (a barra amarela do Chrome foi fechada, por exemplo)
    else if (m.tipo === 'desligou') window.postMessage({ sala3dExt: 'desligou', aba: m.aba, janela: !!m.janela, motivo: m.motivo }, location.origin);
    // a aba compartilhada abriu outra página: a sala mostra o site na barra de navegação
    else if (m.tipo === 'aba-mudou') window.postMessage({ sala3dExt: 'aba-mudou', aba: m.aba, site: m.site, titulo: m.titulo }, location.origin);
    // aviso do site (alert, confirm...) numa aba sob controle: a sala mostra a quem controla
    else if (m.tipo === 'dialogo') window.postMessage({ sala3dExt: 'dialogo', aba: m.aba, dialogo: m.dialogo, site: m.site }, location.origin);
    // Alt+Shift+S (ou o ícone) numa aba: a sala abre a captura dela, sem a barra do Chrome...
    else if (m.tipo === 'capturar-aba') return pedirASala('capturar-aba', { streamId: m.streamId, aba: m.aba, site: m.site, titulo: m.titulo }, responder);
    // ...ou tira da sala, se ela já estava lá
    else if (m.tipo === 'parar-aba') return pedirASala('parar-aba', { aba: m.aba }, responder);
  };
  chrome.runtime.onMessage.addListener(aoFundo);

  function parar() {
    removeEventListener('message', aoSite);
    clearInterval(vivo);
    try { porta?.disconnect(); } catch { /* órfão */ }
    try {
      chrome.runtime.onMessage.removeListener(aoFundo);
    } catch { /* órfão */ }
    for (const responder of esperando.values()) {
      try {
        responder({ erro: 'sem-resposta' });
      } catch { /* órfão */ }
    }
    esperando.clear();
    if (window.__sala3dExt?.parar === parar) delete window.__sala3dExt;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ehSala() && avisar());
  else if (ehSala()) avisar();
})();
