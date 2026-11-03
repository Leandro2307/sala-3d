// Opções do modo jogo de quem joga, guardadas neste aparelho. Mudam no painel do controle de toque
// (celular) e no menu "Opções" ao lado do botão Modo jogo (PC).
//   liso:     um buffer pequeno (LISO_MS) na imagem: segura o tremido do Wi-Fi, com um pouco de atraso
//   menuAuto: quando o jogo mostra o cursor (menu, inventário), o mouse passa a ir pela posição
//   selo:     o selo de desempenho no canto (qps, atraso, banda)
//   giro:     no celular, mirar virando o aparelho (giroscópio)
//   rapido:   menos atraso: quem compartilha manda 720p fixo e até 8 Mbps (quadros menores
//             codificam, viajam e decodificam mais rápido, e o buffer do celular fica menor)
//   turbo:    modo turbo (turbo.js): a imagem por fora do vídeo, sem o buffer do navegador
//   vibrar:   o jogo do PS5 vibra o controle: treme o celular (Android) ou o controle deste aparelho

const CHAVE = 'sala3d-jogo-opcoes';
// Turbo e 720p ligados de fábrica: nos testes (relatório de 2026-11-01 03:35, PS5 → iPhone) o turbo
// em 720p deu ~60 ms de atraso contra ~150 ms do vídeo normal, com metade da banda do turbo em 1080p.
const PADRAO = { liso: false, menuAuto: true, selo: false, giro: false, rapido: true, turbo: true, vibrar: true };
// Versão das opções: quem guardou as de antes (turbo e 720p desligados, que eram o padrão) passa uma
// vez para os padrões novos; o que a pessoa mudar depois disso fica.
const VERSAO = 2;
export const LISO_MS = 40;

function ler() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}');
    const o = { ...PADRAO, ...(v && typeof v === 'object' ? v : {}) };
    if (o.v !== VERSAO) Object.assign(o, { v: VERSAO, turbo: PADRAO.turbo, rapido: PADRAO.rapido });
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
  // f(chave, valor) a cada mudança
  ouvir(f) { ouvintes.add(f); },
};
