// Opções do modo jogo de quem joga, guardadas neste aparelho. Mudam no painel do controle de toque
// (celular) e no menu "Opções" ao lado do botão Modo jogo (PC).
//   liso:     um buffer pequeno (LISO_MS) na imagem: segura o tremido do Wi-Fi, com um pouco de atraso
//   menuAuto: quando o jogo mostra o cursor (menu, inventário), o mouse passa a ir pela posição
//   selo:     o selo de desempenho no canto (qps, atraso, banda)
//   giro:     no celular, mirar virando o aparelho (giroscópio)
//   rapido:   menos atraso: quem compartilha manda 720p fixo e até 8 Mbps (quadros menores
//             codificam, viajam e decodificam mais rápido, e o buffer do celular fica menor)
//   turbo:    modo turbo (turbo.js): a imagem por fora do vídeo, sem o buffer do navegador
//   turboLiso: no turbo, cada quadro espera a hora certa de aparecer (uma folga do tamanho do tremido
//             do Wi-Fi, ~10–30 ms): sem ela, os quadros aparecem na hora em que chegam e a imagem treme
//   vibrar:   o jogo do PS5 vibra o controle: treme o celular (Android) ou o controle deste aparelho
//   preencher: a imagem ocupa a tela toda, sem as faixas pretas (corta um pouco das bordas quando a
//             tela tem outro formato, como o celular deitado, mais comprido que 16:9). Só no PC
//   tela:     no celular, o tamanho da imagem: 'cheia' (a tela toda sem cortar nada: estica um pouco),
//             'inteira' (na proporção certa, com faixas pretas) ou 'cortar' (a tela toda, sem as bordas)

const CHAVE = 'sala3d-jogo-opcoes';
// Turbo ligado de fábrica (o 720p foi de fábrica até 2026-11-16; agora entra o 1080p Turbo liso): nos testes (relatório de 2026-11-01 03:35, PS5 → iPhone) o turbo
// em 720p deu ~60 ms de atraso contra ~150 ms do vídeo normal, com metade da banda do turbo em 1080p.
// liso (o buffer de 40 ms do vídeo normal) ligado de fábrica desde 2026-11-05: no teste de presets o
// "buffer mínimo" deu 401 ms de atraso e 43 travadas por minuto no iPhone, contra 160 ms e 6 com ele.
// É o vídeo que entra quando o turbo não aguenta, então vale também com o turbo ligado.
// nitidez: o realce de nitidez no turbo (turbo.js, Realce) — ligado de fábrica, menos no iPhone/iPad/Mac
// (o WebGL do Safari com o quadro do decodificador não foi testado: lá fica para ligar à mão)
// tratamento: o contra faixas e o grão fino no turbo (turbo.js, TRATAMENTO) — ligado de fábrica no PC; a
// placa lenta o desliga sozinha
const APPLE = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
const TOQUE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
// de fábrica a imagem ocupa o celular todo; num aparelho mais quadrado (iPad) ela esticaria demais
const TELA_PADRAO = typeof screen !== 'undefined' && Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height) >= 1.7 ? 'cheia' : 'inteira';
export const TELAS = { cheia: 'Tela toda', inteira: 'Com faixas', cortar: 'Sem bordas' };
const PADRAO = { liso: true, menuAuto: true, selo: false, giro: false, rapido: false, turbo: true, turboLiso: true, vibrar: true, preencher: false, tela: TELA_PADRAO, lossless: 0, mouseSens: 3, nitidez: !APPLE, tratamento: !APPLE && !TOQUE };
// mouseSens: no PC, num jogo de controle (PS5, Switch), quanto o mouse empurra o analógico direito
// (teclado-pad.js): 2× chega ao fim do analógico com metade do movimento// Versão das opções (v2: turbo e 720p; v3: liso; v4: os modos de imagem de 2026-11-05; v5: os 4 modos
// de 2026-11-16). O modo de imagem não fica guardado: toda vez que a página abre entra o PRESET_INICIAL.
const VERSAO = 7; // v6: a sensibilidade do mouse começa no máximo (3×); v7: o tamanho da imagem no celular
export const LISO_MS = 40;

// Modos de imagem (desde 2026-11-16 só estes 4 e o Manual): a resolução (720p é o "rapido": quem
// compartilha manda 720p fixo) e o jeito de receber — vídeo normal (WebRTC, com o buffer liso de 40 ms)
// ou turbo liso (turbo.js, cada quadro na hora certa). Cada amostra do relatório leva o número do modo;
// os números são novos (11–14) para não misturar com os presets de teste de antes (1–7). vida: a vida
// dos pedaços no canal do turbo (TTL_MS). lisoPct: quanto do tremido a folga do liso cobre (padrão 0,95).
// Mudar uma opção à mão volta para "Manual" (0). No turbo o liso do vídeo normal fica ligado: é o vídeo
// que entra se o turbo cair. Os de antes (relatórios de 2026-11-05): o turbo 720p foi o mais regular
// (~115 ms); sem turbo, 160 ms de atraso; o turbo sem liso treme.
export const PRESETS = [
  { id: 11, nome: '720p', modo: 'Vídeo normal', desc: 'sem turbo, mais compatível', opcoes: { turbo: false, turboLiso: true, rapido: true, liso: true }, vida: 250 },
  { id: 12, nome: '1080p', modo: 'Vídeo normal', desc: 'sem turbo, mais compatível', opcoes: { turbo: false, turboLiso: true, rapido: false, liso: true }, vida: 250 },
  { id: 13, nome: '720p Turbo liso', modo: 'Turbo liso', desc: 'menos atraso, mais leve para o celular', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: true }, vida: 250, lisoPct: 0.9 },
  { id: 14, nome: '1080p Turbo liso', modo: 'Turbo liso', desc: 'menos atraso, imagem mais nítida', opcoes: { turbo: true, turboLiso: true, rapido: false, liso: true }, vida: 250 },
  // Turbo rápido (2026-11-18): o liso segura cada quadro no máximo lisoMax ms (o Turbo liso, até 45). Nos
  // relatórios do lorrel essa espera ficava travada nos 45 ms com o PC de quem compartilha no Wi-Fi — a
  // maior fatia do atraso depois da internet. Aqui são uns 30 ms a menos; com o Wi-Fi tremendo, a imagem
  // treme um pouco (no cabo quase não)
  { id: 15, nome: '720p Turbo rápido', modo: 'Turbo rápido', desc: 'o menor atraso, mais leve; pode tremer um pouco no Wi-Fi', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: true }, vida: 250, lisoPct: 0.9, lisoMax: 15 },
  { id: 16, nome: '1080p Turbo rápido', modo: 'Turbo rápido', desc: 'o menor atraso, imagem nítida; pode tremer um pouco no Wi-Fi', opcoes: { turbo: true, turboLiso: true, rapido: false, liso: true }, vida: 250, lisoMax: 15 },
];
// Turbo da TV (2026-11-24, só no /jogar, e de fábrica lá): exatamente o que o /tv?turbo=1 faz — 1080p, Turbo
// liso com a folga de sempre e nunca o realce de nitidez (semRealce). No notebook do lokao16001 (Intel UHD, as
// duas páginas em sequência, mesmo PS5): TV 39,5 ms com o decodificador a 0,5 ms; /jogar com o realce ligado
// nas Opções 48,8 ms com o decodificador a 5. Fora de PRESETS de propósito: a sala não o mostra.
export const PRESET_TV = { id: 17, nome: '1080p Turbo da TV', modo: 'Turbo da TV', desc: 'igual ao modo TV: 1080p liso, sem o realce de nitidez (a placa de vídeo fica só para a imagem)', opcoes: { turbo: true, turboLiso: true, rapido: false, liso: true }, vida: 250, semRealce: true };
// O automático (turbo-auto.js) tenta nesta ordem: o padrão da página, o Turbo rápido e o Turbo da TV
export const ORDEM_AUTO = { sala: [14, 16, 17], jogar: [17, 16, 14] };
export const PRESET_INICIAL = 14; // o modo em que a página sempre entra
export const OPCOES_DO_PRESET = ['turbo', 'turboLiso', 'rapido', 'liso'];
const presetInicial = () => PRESETS.find((p) => p.id === PRESET_INICIAL);

// o menu de opções do PC vai até o fim da janela e rola por dentro (a barra pode ter uma ou duas linhas)
export function alturaDoMenu(pop) {
  if (pop.hidden) return;
  pop.style.maxHeight = `${Math.max(160, Math.round(innerHeight - pop.getBoundingClientRect().top - 12))}px`;
}

// O seletor do modo de imagem, igual no menu do PC e no painel do celular (main.js ouve o clique em
// [data-preset]): uma grade 2×3 — colunas 720p / 1080p, linhas vídeo normal / turbo liso / turbo
// rápido — e o Manual.
// primeiro: um modo a mais, em cima da grade (o Turbo da TV, no /jogar). O Automático (turbo-auto.js) é o padrão.
export function htmlPresets(primeiro = null) {
  const cartao = (p) => '<button type="button" class="jp-card' + (p.opcoes.turbo ? ' turbo' : '') + '" role="radio" aria-checked="false" data-preset="' + p.id + '" title="' + p.nome + ': ' + p.desc + '">'
    + '<b>' + p.nome.split(' ')[0] + '</b><span>' + p.modo + '</span></button>';
  return '<div class="jogo-presets" role="radiogroup" aria-label="Modo de imagem">'
    + '<span class="jp-tit">Modo de imagem</span>'
    + '<button type="button" class="jp-card jp-manual jp-auto" role="radio" aria-checked="false" data-preset="auto" title="Mede a sua conexão por alguns segundos e fica no modo que der a melhor imagem com o menor atraso"><b>Automático</b><small data-auto-estado>escolhe o melhor para você</small><em>padrão</em></button>'
    + (primeiro ? cartao(primeiro) : '')
    + '<div class="jp-grade">' + PRESETS.map(cartao).join('') + '</div>'
    + '<button type="button" class="jp-card jp-manual" role="radio" aria-checked="false" data-preset="0"><b>Manual</b><small>as opções abaixo</small></button>'
    + '</div>';
}

// o que o cartão do Automático mostra (a página muda e chama marcarPresets)
export const autoMostra = { ligado: false, texto: 'escolhe o melhor para você' };
// marca no seletor (em raiz) o modo de agora
export function marcarPresets(raiz = document) {
  const atual = autoMostra.ligado ? 'auto' : String(valores.preset || 0);
  raiz.querySelectorAll('[data-auto-estado]').forEach((el) => { el.textContent = autoMostra.ligado ? autoMostra.texto : 'escolhe o melhor para você'; });
  raiz.querySelectorAll('[data-preset]').forEach((el) => {
    const on = el.dataset.preset === atual;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', String(on));
  });
}

function ler() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    const o = { ...PADRAO, ...(v && typeof v === 'object' ? v : {}) };
    const v0 = Number(o.v) || 0;
    if (v0 < 2) Object.assign(o, { turbo: PADRAO.turbo, rapido: PADRAO.rapido });
    if (v0 < 3) o.liso = true;
    if (v0 < 6) o.mouseSens = PADRAO.mouseSens;
    if (v0 < 7 && o.preencher) o.tela = 'cortar'; // já tinha escolhido "Preencher a tela"
    if (!Object.hasOwn(TELAS, o.tela)) o.tela = TELA_PADRAO;
    o.v = VERSAO;
    // toda vez que a página abre: o modo inicial, com as opções dele (o Manual dura até recarregar)
    return Object.assign(o, { preset: PRESET_INICIAL }, presetInicial().opcoes);
  } catch {
    return { ...PADRAO, ...presetInicial().opcoes, preset: PRESET_INICIAL, v: VERSAO };
  }
}

const valores = ler();
const ouvintes = new Set();

export const opcoesJogo = {
  get: (k) => valores[k],
  set(k, v) {
    if (valores[k] === v) return;
    valores[k] = v;
    try { localStorage.setItem(CHAVE, JSON.stringify(valores)); } catch { /* sem armazenamento */ }
    for (const f of ouvintes) f(k, v);
  },
  // várias de uma vez (um preset): grava tudo e avisa uma vez só, com a chave 'preset'
  setVarios(obj) {
    Object.assign(valores, obj);
    try { localStorage.setItem(CHAVE, JSON.stringify(valores)); } catch { /* sem armazenamento */ }
    for (const f of ouvintes) f('preset', valores.preset);
  },
  // f(chave, valor) a cada mudança
  ouvir(f) { ouvintes.add(f); },
};
