// Simula mãos de poker no servidor (poker-servidor.js) com um relógio falso: um humano que joga ao
// acaso contra os robôs. Confere que nenhuma mão trava e que as moedas fecham (o que sai do saldo
// volta para alguém ou fica com os robôs). node scripts/simular-poker.js [mãos]
const MAOS = Number(process.argv[2]) || 300;

let agora = 1_000_000;
Date.now = () => agora;
const tics = [];
global.setInterval = (fn) => tics.push(fn);

const { ligarPoker } = require('../poker-servidor.js');

const eventos = [];
const io = { to: () => ({ emit: (ev, d) => eventos.push([ev, d]) }) };
const user = { id: 'u1', name: 'Teste', color: '#fff', moedas: 500, p: [12, 0, 649 + 2] };
const room = { id: 'sala', users: new Map([['u1', user]]), config: { jogos: {} } };
const rooms = new Map([['sala', room]]);
let movimento = 0; // tudo que entrou e saiu do saldo
const darMoedas = (r, u, qtd) => {
  u.moedas = Math.max(0, u.moedas + qtd);
  movimento += qtd;
};
const porSocket = ligarPoker(io, rooms, () => true, darMoedas);
const handlers = {};
const socket = { on: (ev, fn) => { handlers[ev] = fn; }, to: () => ({ emit() {} }) };
porSocket(socket, () => ({ room, user }));

(async () => {
  // espera as regras e os dados do mapa carregarem
  for (let i = 0; i < 50 && !room.poker; i++) {
    await new Promise((r) => setTimeout(r, 50));
    try { handlers['pk-ver'](() => {}); } catch { /* ainda carregando */ }
  }
  const m = room.poker.mesas[0];
  user.p = [m.i === 0 ? 12 : 32, 0, 651];
  handlers['pk-sentar']({ mesa: 0 }, (r) => { if (!r.ok) throw new Error(`não sentou: ${r.erro}`); });
  handlers['pk-comecar']({ mesa: 0 });
  let maos = 0;
  let travou = 0;
  let ultimaMao = m.mao;
  let desde = agora;
  const inicio = user.moedas;
  let depositos = 0;
  while (maos < MAOS) {
    agora += 300;
    user.pkApostouEm = 0;
    for (const t of tics) t();
    const k = m.lugares.findIndex((l) => l && l.id === 'u1');
    if (k < 0) {
      // ficou sem moedas e saiu; põe moedas e senta de novo
      user.moedas += 300;
      depositos += 300;
      handlers['pk-sentar']({ mesa: 0 }, () => {});
      if (m.fase === 'espera') handlers['pk-comecar']({ mesa: 0 });
      continue;
    }
    if (m.vez === k && Math.random() < 0.5) {
      const tipos = ['fold', 'check', 'call', 'call', 'call', 'raise', 'allin'];
      const tipo = tipos[Math.floor(Math.random() * (Math.random() < 0.97 ? 6 : 7))];
      handlers['pk-apostar']({ mesa: 0, tipo, valor: m.apostaAtual + 2 + Math.floor(Math.random() * 10) });
    }
    if (m.mao !== ultimaMao) {
      maos++;
      ultimaMao = m.mao;
      desde = agora;
    }
    if (agora - desde > 10 * 60_000) {
      travou++;
      console.log('TRAVOU', m.fase, 'vez', m.vez, m.lugares.map((l) => l && { b: l.bot, f: l.fold, a: l.allIn, ag: l.agiu }), m.apostas, m.apostaAtual);
      break;
    }
    // conferência do pote no meio da mão: o que saiu do saldo do humano está na mesa
    const l = m.lugares[k];
    if (l && m.fase !== 'showdown' && m.fase !== 'espera' && l.apostadoTotal < m.apostas[k]) {
      console.log('ERRO: aposta da rodada maior que o total apostado');
      travou++;
      break;
    }
  }
  const pk = eventos.filter(([e]) => e === 'pk-mesa').length;
  // as moedas fecham: saldo final = inicial + depósitos + tudo que o poker mexeu
  const fecha = user.moedas === inicio + depositos + movimento;
  if (!fecha) travou++;
  console.log(`${maos} mãos, ${pk} atualizações, saldo ${inicio} -> ${user.moedas} (+${depositos} repostos), poker mexeu ${movimento}: ${fecha ? 'fecha' : 'NÃO FECHA'}`);
  console.log(travou ? 'FALHOU' : 'ok: nenhuma mão travou');
  process.exit(travou ? 1 : 0);
})();
