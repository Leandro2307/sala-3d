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
const PADRAO = { liso: false, menuAuto: true, selo: false, giro: false, rapido: true, turbo: true, turboLiso: true, vibrar: true };
// Versão das opções: quem guardou as de antes (turbo e 720p desligados, que eram o padrão) passa uma
// vez para os padrões novos; o que a pessoa mudar depois disso fica.
const VERSAO = 2;
export const LISO_MS = 40;

// Presets de teste (2026-11-05): cada um é um jeito completo de receber a imagem, para jogar 1 minuto
// em cada e comparar no relatório (cada amostra leva o número do preset; o resumo separa por preset).
// "Teste automático" passa por todos, 1 minuto em cada (main.js, rodarTestePresets). vida: a vida dos
// pedaços no canal do turbo (turbo.js, TTL_MS). Mudar uma opção à mão volta para "Manual" (0).
export const PRESETS = [
  { id: 1, nome: 'Turbo liso 720p', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: false }, vida: 250 },
  { id: 2, nome: 'Turbo liso 1080p', opcoes: { turbo: true, turboLiso: true, rapido: false, liso: false }, vida: 250 },
  { id: 3, nome: 'Turbo liso 720p, vida 90 ms (antigo)', opcoes: { turbo: true, turboLiso: true, rapido: true, liso: false }, vida: 90 },
  { id: 4, nome: 'Turbo sem liso 720p', opcoes: { turbo: true, turboLiso: false, rapido: true, liso: false }, vida: 250 },
  { id: 5, nome: 'Vídeo normal 720p', opcoes: { turbo: false, turboLiso: true, rapido: true, liso: false }, vida: 250 },
  { id: 6, nome: 'Vídeo normal mais liso (+40 ms)', opcoes: { turbo: false, turboLiso: true, rapido: true, liso: true }, vida: 250 },
];
export const OPCOES_DO_PRESET = ['turbo', 'turboLiso', 'rapido', 'liso'];

// o preset cujas opções são as de agora (o de vida 250 ganha do de 90 quando empatam), ou 0
function presetQueCasa(o) {
  return PRESETS.find((p) => p.vida === 250 && OPCOES_DO_PRESET.every((k) => !!o[k] === p.opcoes[k]))?.id ?? 0;
}

// o seletor de presets e o teste automático, igual no menu do PC e no painel do celular (main.js ouve)
export function htmlPresets() {
  const itens = PRESETS.map((p) => '<option value="' + p.id + '">' + p.id + '. ' + p.nome + '</option>').join('');
  return '<div class="jogo-presets">'
    + '<label><span>Preset de teste</span><select data-preset><option value="0">Manual</option>' + itens + '</select></label>'
    + '<button type="button" data-teste-presets>Teste automático <small>(1 min em cada, ' + PRESETS.length + ' min)</small></button>'
    + '</div>';
}

function ler() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    const o = { ...PADRAO, ...(v && typeof v === 'object' ? v : {}) };
    if (o.v !== VERSAO) Object.assign(o, { v: VERSAO, turbo: PADRAO.turbo, rapido: PADRAO.rapido });
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
