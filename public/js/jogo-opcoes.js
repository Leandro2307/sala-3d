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

const CHAVE = 'sala3d-jogo-opcoes';
// Turbo e 720p ligados de fábrica: nos testes (relatório de 2026-11-01 03:35, PS5 → iPhone) o turbo
// em 720p deu ~60 ms de atraso contra ~150 ms do vídeo normal, com metade da banda do turbo em 1080p.
// liso (o buffer de 40 ms do vídeo normal) ligado de fábrica desde 2026-11-05: no teste de presets o
// "buffer mínimo" deu 401 ms de atraso e 43 travadas por minuto no iPhone, contra 160 ms e 6 com ele.
// É o vídeo que entra quando o turbo não aguenta, então vale também com o turbo ligado.
const PADRAO = { liso: true, menuAuto: true, selo: false, giro: false, rapido: true, turbo: true, turboLiso: true, vibrar: true };
// Versão das opções: quem guardou as de antes passa uma vez para os padrões novos (v2: turbo e 720p;
// v3: liso); o que a pessoa mudar depois disso fica.
const VERSAO = 3;
export const LISO_MS = 40;

// Presets de teste (2026-11-05): cada um é um jeito completo de receber a imagem, para jogar 1 minuto
// em cada e comparar no relatório (cada amostra leva o número do preset; o resumo separa por preset).
// "Teste automático" passa por todos, 1 minuto em cada (main.js, rodarTestePresets). vida: a vida dos
// pedaços no canal do turbo (turbo.js, TTL_MS). h265: o turbo pede H.265 (cai no H.264 se a placa ou o
// aparelho não tiverem). lisoPct: quanto do tremido a folga do liso cobre (padrão 0,95). Mudar uma
// opção à mão volta para "Manual" (0). Nos de turbo o liso do vídeo normal fica ligado: é o vídeo que
// entra se o turbo cair.
export const PRESETS = [
  { id: 1, nome: 'Turbo liso 720p', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: true }, vida: 250 },
  { id: 2, nome: 'Turbo liso 1080p', opcoes: { turbo: true, turboLiso: true, rapido: false, liso: true }, vida: 250 },
  { id: 3, nome: 'Turbo liso 720p, vida 90 ms (antigo)', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: true }, vida: 90 },
  { id: 4, nome: 'Turbo sem liso 720p', opcoes: { turbo: true, turboLiso: false, rapido: true, liso: true }, vida: 250 },
  { id: 5, nome: 'Vídeo normal 720p (buffer mínimo)', opcoes: { turbo: false, turboLiso: true, rapido: true, liso: false }, vida: 250 },
  { id: 6, nome: 'Vídeo normal mais liso (+40 ms)', opcoes: { turbo: false, turboLiso: true, rapido: true, liso: true }, vida: 250 },
  { id: 7, nome: 'Turbo liso 720p H.265', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: true }, vida: 250, h265: true },
  { id: 8, nome: 'Turbo liso 720p, folga menor', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: true }, vida: 250, lisoPct: 0.9 },
  { id: 9, nome: 'Turbo liso 1080p H.265', opcoes: { turbo: true, turboLiso: true, rapido: false, liso: true }, vida: 250, h265: true },
];
export const OPCOES_DO_PRESET = ['turbo', 'turboLiso', 'rapido', 'liso'];
// o teste automático: o de agora (1) contra os novos; os de 1080p por último (esquentam o iPhone)
export const ORDEM_TESTE = [1, 7, 8, 6, 2, 9];

// o preset cujas opções são as de agora (só os "puros": sem vida antiga, H.265 ou folga própria), ou 0
function presetQueCasa(o) {
  return PRESETS.find((p) => p.vida === 250 && !p.h265 && !p.lisoPct && OPCOES_DO_PRESET.every((k) => !!o[k] === p.opcoes[k]))?.id ?? 0;
}

// o seletor de presets e o teste automático, igual no menu do PC e no painel do celular (main.js ouve)
export function htmlPresets() {
  const itens = PRESETS.map((p) => '<option value="' + p.id + '">' + p.id + '. ' + p.nome + '</option>').join('');
  return '<div class="jogo-presets">'
    + '<label><span>Preset de teste</span><select data-preset><option value="0">Manual</option>' + itens + '</select></label>'
    + '<button type="button" data-teste-presets>Teste automático <small>(1 min em cada, ' + ORDEM_TESTE.length + ' min)</small></button>'
    + '</div>';
}

function ler() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    const o = { ...PADRAO, ...(v && typeof v === 'object' ? v : {}) };
    const v0 = Number(o.v) || 0;
    if (v0 < 2) Object.assign(o, { turbo: PADRAO.turbo, rapido: PADRAO.rapido });
    if (v0 < 3) {
      o.liso = true;
      o.preset = undefined; // o preset de antes tinha o liso desligado: confere de novo
    }
    o.v = VERSAO;
    if (typeof o.preset !== 'number') o.preset = presetQueCasa(o);
    return o;
  } catch {
    return { ...PADRAO, v: VERSAO };
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
