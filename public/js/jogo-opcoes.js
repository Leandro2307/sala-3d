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
//             tela tem outro formato, como o celular deitado, mais comprido que 16:9)

const CHAVE = 'sala3d-jogo-opcoes';
// Turbo e 720p ligados de fábrica: nos testes (relatório de 2026-11-01 03:35, PS5 → iPhone) o turbo
// em 720p deu ~60 ms de atraso contra ~150 ms do vídeo normal, com metade da banda do turbo em 1080p.
// liso (o buffer de 40 ms do vídeo normal) ligado de fábrica desde 2026-11-05: no teste de presets o
// "buffer mínimo" deu 401 ms de atraso e 43 travadas por minuto no iPhone, contra 160 ms e 6 com ele.
// É o vídeo que entra quando o turbo não aguenta, então vale também com o turbo ligado.
const PADRAO = { liso: true, menuAuto: true, selo: false, giro: false, rapido: true, turbo: true, turboLiso: true, vibrar: true, preencher: false };
// Versão das opções: quem guardou as de antes passa uma vez para os padrões novos (v2: turbo e 720p;
// v3: liso; v4: os modos de imagem definitivos, no 1); o que a pessoa mudar depois disso fica.
const VERSAO = 4;
export const LISO_MS = 40;

// Modos de imagem (definitivos desde 2026-11-05), do melhor para o pior, pelos testes de presets com o
// PC no Wi-Fi e o iPhone (relatórios de 2026-11-05 00:40 a 01:35): cada um é um jeito completo de
// receber a imagem, e cada amostra do relatório leva o número dele. vida: a vida dos pedaços no canal
// do turbo (turbo.js, TTL_MS). h265: o turbo pede H.265 (cai no H.264 se a placa ou o aparelho não
// tiverem). lisoPct: quanto do tremido a folga do liso cobre (padrão 0,95). Mudar uma opção à mão volta
// para "Manual" (0). Nos de turbo o liso do vídeo normal fica ligado: é o vídeo que entra se o turbo cair.
//   1: o mais regular nos dois testes (1,8 e 6,7 travadas por minuto, ~115 ms)
//   2: o mesmo em H.265 — imagem mais nítida na mesma banda, um pouco mais sensível a perdas
//   3: 1080p H.265 — o mais nítido, ~15 ms a mais; pode esquentar o iPhone em sessões longas
//   4: 1080p em H.264 — sofreu mais com o Wi-Fi parando (30 travadas por minuto num teste)
//   5: sem o liso — ~30 ms a menos, mas a imagem treme (538 quadros por minuto sem aparecer)
//   6 e 7: sem turbo — 160 e 401 ms de atraso
export const PRESETS = [
  { id: 1, nome: 'Turbo 720p', desc: 'recomendado', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: true }, vida: 250, lisoPct: 0.9 },
  { id: 2, nome: 'Turbo 720p H.265', desc: 'imagem mais nítida', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: true }, vida: 250, lisoPct: 0.9, h265: true },
  { id: 3, nome: 'Turbo 1080p H.265', desc: 'a mais nítida, um pouco mais de atraso', opcoes: { turbo: true, turboLiso: true, rapido: false, liso: true }, vida: 250, h265: true },
  { id: 4, nome: 'Turbo 1080p', desc: 'nítida, sofre mais com o Wi-Fi', opcoes: { turbo: true, turboLiso: true, rapido: false, liso: true }, vida: 250 },
  { id: 5, nome: 'Turbo sem liso', desc: 'menos atraso, imagem treme', opcoes: { turbo: true, turboLiso: false, rapido: true, liso: true }, vida: 250 },
  { id: 6, nome: 'Vídeo normal', desc: 'sem turbo, mais atraso', opcoes: { turbo: false, turboLiso: true, rapido: true, liso: true }, vida: 250 },
  { id: 7, nome: 'Vídeo normal, buffer mínimo', desc: 'o pior no iPhone', opcoes: { turbo: false, turboLiso: true, rapido: true, liso: false }, vida: 250 },
];
export const OPCOES_DO_PRESET = ['turbo', 'turboLiso', 'rapido', 'liso'];

// o seletor do modo de imagem, igual no menu do PC e no painel do celular (main.js ouve)
export function htmlPresets() {
  const itens = PRESETS.map((p) => '<option value="' + p.id + '">' + p.id + '. ' + p.nome + ' (' + p.desc + ')</option>').join('');
  return '<div class="jogo-presets">'
    + '<label><span>Modo de imagem</span><select data-preset>' + itens + '<option value="0">Manual (as opções abaixo)</option></select></label>'
    + '</div>';
}

function ler() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    const o = { ...PADRAO, ...(v && typeof v === 'object' ? v : {}) };
    const v0 = Number(o.v) || 0;
    if (v0 < 2) Object.assign(o, { turbo: PADRAO.turbo, rapido: PADRAO.rapido });
    if (v0 < 3) o.liso = true;
    // os números dos presets de teste mudaram: todo mundo começa no modo 1 (o recomendado)
    if (v0 < 4) Object.assign(o, { preset: 1 }, PRESETS[0].opcoes);
    o.v = VERSAO;
    if (typeof o.preset !== 'number') o.preset = 1;
    return o;
  } catch {
    return { ...PADRAO, ...PRESETS[0].opcoes, preset: 1, v: VERSAO };
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
