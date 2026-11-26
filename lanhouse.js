// Lan house: a sala vira um PC/PS5 alugado por hora. Cada jogador tem uma conta (nome + senha),
// escolhe um horário livre na página /lan, paga pela Stripe e, na hora reservada, só ele consegue
// mexer nas telas com controle liberado (o servidor barra o resto, e o PC que compartilha também —
// ver jogadorAgora no server.js e state.lan no main.js).
//
// Ambiente (no Render: Environment):
//   STRIPE_KEY      chave secreta ou restrita (rk_live_...) com escrita em Checkout Sessions e leitura
//                   em Products/Prices. Sem ela, a página mostra os horários mas não deixa pagar.
//   STRIPE_PRODUTO  o produto da hora (padrão abaixo); o preço é o default_price dele.
//   LAN_SEGREDO     assina o login das contas (sem ele, usa PASSE_SECRET ou deriva da STRIPE_KEY).
//
// Sem webhook: a volta do checkout confirma na hora (/lan/confirmar) e, a cada minuto, o servidor
// pergunta à Stripe pelas reservas que ainda estão esperando o pagamento.
// Formas de pagamento: as ligadas no painel da Stripe (cartão e Pix). O Pix vence em PIX_MS; boleto tem
// que ficar desligado lá, porque a hora é solta quando o prazo do Pix acaba.
const crypto = require('crypto');
const express = require('express');

const PRODUTO_PADRAO = 'prod_Ve7zvIChkAKvic';
const HORA = 3600_000;
const FUSO = -3; // horário de Brasília (sem horário de verão desde 2019)
const DIAS_A_FRENTE = 14;
const MAX_HORAS = 8; // horas numa compra só
// o que se aluga: cada máquina tem a sua agenda (a tela de PS5 é a do PS5 direto, o resto é PC)
const MAQUINAS = { pc: 'PC', ps5: 'PS5' };
const maquinaDe = (m) => (Object.hasOwn(MAQUINAS, m) ? m : 'pc');
const ESPERA_CHECKOUT = 31 * 60_000; // a Stripe exige pelo menos 30 min até a sessão expirar
const PIX_MS = 10 * 60_000; // validade do código Pix (o padrão da Stripe é 4 h: seguraria a hora à toa)
const FOLGA_PIX = 60_000; // o Pix pago no último segundo ainda chega a tempo
const VIGIA_MS = 15 * 60_000; // checkout já solto: ainda confere este tempo se caiu um pagamento atrasado
const TOKEN_DIAS = 30;
// Teste grátis: com a máquina sem ninguém alugado, cada pessoa joga 2 min uma vez só. O tempo conta
// do primeiro comando que ela manda ao jogo. Fica marcado na conta e no IP: outra conta criada no
// mesmo lugar não ganha outro teste.
const TESTE_MS = 2 * 60_000;

// o nome é o da pessoa (com acento e espaço); a conta é ele em minúsculas, então "Ana" e "ana" são a mesma
const limparNome = (n) => String(n ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const nomeValido = (n) => typeof n === 'string' && /^[\p{L}\p{N}._ -]{2,20}$/u.test(n) && n === limparNome(n);
const senhaValida = (s) => typeof s === 'string' && s.length >= 6 && s.length <= 100;

// "2026-11-17" e hora (0–23, Brasília) → ms UTC; e o contrário
const inicioDaHora = (dia, h) => {
  const [y, m, d] = dia.split('-').map(Number);
  return Date.UTC(y, m - 1, d, h - FUSO);
};
const diaDe = (ms) => new Date(ms + FUSO * HORA).toISOString().slice(0, 10);
const horaDe = (ms) => new Date(ms + FUSO * HORA).getUTCHours();

// jogosDaSala(sala): o catálogo do PC da casa ([{ id, nome, steam, icone }], ver 'hub-jogos' no server.js)
module.exports = function criarLanhouse({ banco, hashSenha, confereSenha, podeTentar, bloqueado, configDaSala, jogosDaSala, aoMudar }) {
  const CHAVE = process.env.STRIPE_KEY || '';
  const PRODUTO = process.env.STRIPE_PRODUTO || PRODUTO_PADRAO;
  const SEGREDO = process.env.LAN_SEGREDO || process.env.PASSE_SECRET
    || (CHAVE ? crypto.createHash('sha256').update(`sala3d-lan|${CHAVE}`).digest('hex') : crypto.randomBytes(32).toString('hex'));

  const reservas = new Map(); // id -> reserva (só as de ontem para a frente ficam na memória)
  const testes = new Map(); // "sala|c:conta" ou "sala|ip:1.2.3.4" -> { conta, fim }
  let preco = null; // { id, valor (centavos), moeda }

  // ---------------------------------------------------------- Stripe (sem SDK: só fetch)
  async function stripe(metodo, caminho, corpo) {
    if (!CHAVE) throw new Error('STRIPE_KEY não configurada');
    const r = await fetch(`https://api.stripe.com/v1/${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${CHAVE}`,
        ...(corpo ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: corpo ? new URLSearchParams(corpo).toString() : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `Stripe ${r.status}`);
    return j;
  }

  async function lerPreco() {
    if (preco) return preco;
    const prod = await stripe('GET', `products/${encodeURIComponent(PRODUTO)}?expand[]=default_price`);
    const p = prod.default_price;
    if (!p?.id || p.type !== 'one_time') throw new Error('O produto da Stripe precisa de um preço padrão de pagamento único');
    preco = { id: p.id, valor: p.unit_amount, moeda: p.currency, nome: prod.name };
    return preco;
  }

  // ---------------------------------------------------------- contas
  const assinar = (txt) => crypto.createHmac('sha256', SEGREDO).update(txt).digest('hex').slice(0, 32);
  const tokenDe = (nome) => {
    const ate = Date.now() + TOKEN_DIAS * 86400_000;
    return `${nome}:${ate}:${assinar(`${nome}:${ate}`)}`;
  };
  // o nome da conta, se o token vale
  function contaDoToken(token) {
    if (typeof token !== 'string' || token.length > 120) return null;
    const [nome, ate, assin] = token.split(':');
    if (!nomeValido(nome) || !(Number(ate) > Date.now()) || !assin) return null;
    const certa = assinar(`${nome}:${ate}`);
    if (assin.length !== certa.length || !crypto.timingSafeEqual(Buffer.from(assin), Buffer.from(certa))) return null;
    return nome;
  }

  // ---------------------------------------------------------- teste grátis
  // { fim } com o teste correndo; { acabou: true } já usado (por esta conta ou por outra do mesmo IP); {} nunca usou
  function teste(sala, conta, ip, agora = Date.now()) {
    const c = conta ? testes.get(`${sala}|c:${conta}`) : null;
    if (c) return c.fim > agora ? { fim: c.fim } : { acabou: true };
    if (ip && testes.has(`${sala}|ip:${ip}`)) return { acabou: true, ip: true };
    return {};
  }
  // começa o teste (primeiro comando ao jogo): o fim, ou null se já tinha começado ou acabado
  function comecarTeste(sala, conta, ip) {
    if (!conta) return null;
    const t = teste(sala, conta, ip);
    if (t.fim || t.acabou) return null;
    const fim = Date.now() + TESTE_MS;
    for (const chave of [`${sala}|c:${conta}`, ...(ip ? [`${sala}|ip:${ip}`] : [])]) {
      testes.set(chave, { conta, fim });
      banco.salvarTeste({ chave, conta, fim }).catch((err) => console.warn('[lan] guardando teste', err.code || err.message));
    }
    console.log(`[lan] ${sala}: teste grátis de ${conta}${ip ? ` (${ip})` : ''}`);
    return fim;
  }

  // ---------------------------------------------------------- reservas
  // a hora está tomada por uma paga ou por alguém que está no checkout agora
  // (o teste curto do dono que já acabou não segura mais nada: antes, depois de um reinício do servidor,
  // ele ficava "pago" o resto da hora e o "Liberar" achava que a hora já era da pessoa)
  const segura = (r, agora = Date.now()) => (r.status === 'paga' && !(r.fimCedo && r.fimCedo <= agora)) || (r.status === 'pendente' && r.expira > agora);
  const daHora = (sala, maquina, inicio, agora = Date.now()) => [...reservas.values()].find((r) => r.sala === sala && maquinaDe(r.maquina) === maquina && r.inicio === inicio && segura(r, agora));

  // quem joga agora nesta máquina da sala: { conta, inicio, fim } (horas pagas seguidas da mesma conta viram uma só)
  function jogadorAgora(sala, maquina = 'pc', agora = Date.now()) {
    const h = Math.floor(agora / HORA) * HORA;
    const r = daHora(sala, maquina, h, agora);
    if (!r || r.status !== 'paga') return null;
    // liberação que acaba antes da hora cheia (o liberado pelo dono, ver comecarLiberadas)
    if (r.fimCedo) return agora >= r.fimCedo ? null : { conta: r.conta, inicio: h, fim: r.fimCedo, jogo: r.jogo || null, jogoNome: r.jogoNome || null };
    let fim = h + HORA;
    for (let p = daHora(sala, maquina, fim, agora); p?.conta === r.conta && p.status === 'paga'; p = daHora(sala, maquina, fim, agora)) {
      // a seguinte dela acaba cedo (o liberado que passou da hora cheia): a vez vai até ali
      if (p.fimCedo) {
        fim = p.fimCedo;
        break;
      }
      fim += HORA;
    }
    // jogo: o que a pessoa escolheu para esta hora (o PC da casa abre sozinho, ver vigiarJogoLan)
    return { conta: r.conta, inicio: h, fim, jogo: r.jogo || null, jogoNome: r.jogoNome || null };
  }

  async function guardar(r) {
    try {
      await banco.salvarReserva(r);
    } catch (err) {
      console.warn('[lan] guardando reserva', err.code || err.message);
    }
  }

  async function mudarStatus(lista, status) {
    for (const r of lista) {
      if (r.status === status) continue;
      r.status = status;
      await guardar(r);
      console.log(`[lan] ${r.sala} ${MAQUINAS[maquinaDe(r.maquina)]} ${diaDe(r.inicio)} ${horaDe(r.inicio)}h (${r.conta}): ${status}`);
    }
    for (const sala of new Set(lista.map((r) => r.sala))) aoMudar?.(sala);
  }

  // Pago tarde demais: a hora já acabou, ou foi solta e outra reserva está com ela. Não entra na agenda;
  // o dono devolve o valor no painel da Stripe.
  const tardeDemais = (r, agora) => r.inicio + HORA <= agora
    || [...reservas.values()].some((o) => o !== r && o.sala === r.sala && maquinaDe(o.maquina) === maquinaDe(r.maquina) && o.inicio === r.inicio && segura(o, agora));

  // pergunta à Stripe como está a sessão e acerta as reservas dela
  async function conferirSessao(sessao) {
    const lista = [...reservas.values()].filter((r) => r.sessao === sessao);
    if (!lista.length) return null;
    const s = await stripe('GET', `checkout/sessions/${encodeURIComponent(sessao)}`);
    const agora = Date.now();
    const pendentes = lista.filter((r) => r.status === 'pendente');
    if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') {
      // cancelada com expira 0: o dono encerrou a vez (ver encerrar), não volta
      const novas = lista.filter((r) => r.status === 'pendente' || (r.status === 'cancelada' && r.expira));
      const tarde = novas.filter((r) => tardeDemais(r, agora));
      await mudarStatus(novas.filter((r) => !tarde.includes(r)), 'paga');
      await mudarStatus(tarde, 'devolver');
      for (const r of tarde) console.warn(`[lan] DEVOLVER ${r.conta}: pagou ${diaDe(r.inicio)} ${horaDe(r.inicio)}h tarde demais (${sessao.slice(0, 24)})`);
    } else if (s.status === 'expired') await mudarStatus(pendentes, 'cancelada');
    // Pix gerado e ainda não pago: segura a hora só até o código vencer. O prazo conta de quando o
    // servidor viu (nunca antes do de verdade), e não passa do último Pix possível deste checkout.
    else if (s.status === 'complete') {
      for (const r of pendentes) {
        if (r.pixAte) continue;
        r.pixAte = Math.min(agora + PIX_MS, r.criada + ESPERA_CHECKOUT + PIX_MS) + FOLGA_PIX;
        r.expira = r.pixAte;
        await guardar(r);
      }
      const vencidas = pendentes.filter((r) => r.pixAte <= agora);
      if (vencidas.length) await mudarStatus(vencidas, 'cancelada');
    }
    return lista;
  }

  let conferindo = false;
  async function conferirPendentes() {
    if (conferindo || !CHAVE) return;
    conferindo = true;
    try {
      const agora = Date.now();
      // as que esperam o pagamento e as soltas há pouco (um Pix pago no limite ainda pode cair)
      const sessoes = new Set([...reservas.values()]
        .filter((r) => r.sessao?.startsWith('cs_') && (r.status === 'pendente' || (r.status === 'cancelada' && r.expira > agora - VIGIA_MS)))
        .map((r) => r.sessao));
      for (const s of sessoes) {
        try {
          await conferirSessao(s);
        } catch (err) {
          console.warn('[lan] conferindo', s.slice(0, 20), err.message);
        }
      }
      // pendente sem sessão (o checkout nem abriu) ou vencida: libera a hora
      const vencidas = [...reservas.values()].filter((r) => r.status === 'pendente' && (!r.sessao || r.expira < agora - 5 * 60_000) && r.inicio + HORA < agora);
      if (vencidas.length) await mudarStatus(vencidas, 'cancelada');
      // fora da memória o que já passou faz tempo
      for (const [id, r] of reservas) if (r.inicio < agora - 2 * 86400_000) reservas.delete(id);
    } finally {
      conferindo = false;
    }
  }

  async function iniciar() {
    try {
      for (const r of await banco.lerReservas(Date.now() - 2 * 86400_000)) {
        // teste curto do dono (liberar com minutos): o fim fica no "expira", antes do fim da hora
        if (r.sessao === 'cortesia' && r.status === 'paga' && r.expira > r.inicio && r.expira < r.inicio + HORA) r.fimCedo = r.expira;
        reservas.set(r.id, r);
        // já acabou enquanto o servidor estava fora: vira cancelada (o timer de liberar não existe mais)
        if (r.fimCedo && r.fimCedo <= Date.now()) {
          r.status = 'cancelada';
          await guardar(r);
        } else if (r.fimCedo) {
          const fimCedo = r.fimCedo;
          setTimeout(() => { if (r.fimCedo === fimCedo) mudarStatus([r], 'cancelada').catch(() => {}); }, fimCedo - Date.now() + 500).unref?.();
        }
      }
    } catch (err) {
      console.warn('[lan] lendo reservas', err.code || err.message);
    }
    try {
      for (const t of await banco.lerTestes()) testes.set(t.chave, { conta: t.conta, fim: t.fim });
    } catch (err) {
      console.warn('[lan] lendo testes', err.code || err.message);
    }
    console.log(`  Lan house:     ${CHAVE ? `Stripe ligada (${PRODUTO})` : 'sem STRIPE_KEY (não dá para pagar)'}, ${reservas.size} reservas`);
    setInterval(() => conferirPendentes().catch(() => {}), 60_000).unref();
    if (CHAVE) lerPreco().catch((err) => console.warn('[lan] preço da Stripe:', err.message));
  }

  // ---------------------------------------------------------- rotas
  const ipDe = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const origemDe = (req) => {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    return `${proto}://${host}`;
  };
  const idDaSala = (raw) => String(raw ?? '').trim().slice(0, 40).toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'principal';
  const json = express.json({ limit: '4kb' });

  function rotas(app) {
    // entrar ou criar a conta: devolve o token que a página guarda
    app.post('/lan/conta', json, async (req, res) => {
      const b = req.body || {};
      const nome = limparNome(b.nome);
      if (!nomeValido(nome)) return res.json({ ok: false, erro: 'O nome pode ter de 2 a 20 letras, números, espaço, ponto, traço ou _.' });
      if (!senhaValida(b.senha)) return res.json({ ok: false, erro: 'A senha precisa ter de 6 a 100 caracteres.' });
      // conta só o que falhou (senha errada) e as contas criadas: várias pessoas no mesmo Wi-Fi entram normalmente
      const ip = ipDe(req);
      if (bloqueado(ip)) return res.json({ ok: false, erro: 'Muitas tentativas. Espere alguns minutos.' });
      // nome novo: cria a conta com esta senha; nome que já existe: confere a senha
      let criou = false;
      try {
        const c = await banco.lerConta(nome);
        if (c) {
          if (!confereSenha(b.senha, c.senhaHash)) {
            podeTentar(ip);
            return res.json({ ok: false, erro: 'Senha errada para esse nome. Se é a sua primeira vez, escolha outro nome.' });
          }
        } else {
          if (!podeTentar(ip)) return res.json({ ok: false, erro: 'Muitas contas criadas daqui. Espere alguns minutos.' });
          criou = await banco.criarConta(nome, hashSenha(b.senha));
          if (!criou) return res.json({ ok: false, erro: 'Esse nome acabou de ser usado. Tente de novo.' });
        }
      } catch (err) {
        console.warn('[lan] conta', err.code || err.message);
        return res.json({ ok: false, erro: 'Não deu para acessar as contas agora. Tente de novo.' });
      }
      return res.json({ ok: true, nome, token: tokenDe(nome), criou });
    });

    // trocar a senha (precisa da atual)
    app.post('/lan/senha', json, async (req, res) => {
      const b = req.body || {};
      const nome = contaDoToken(b.token);
      if (!nome) return res.json({ ok: false, erro: 'login' });
      if (!senhaValida(b.nova)) return res.json({ ok: false, erro: 'A senha nova precisa ter de 6 a 100 caracteres.' });
      if (bloqueado(ipDe(req))) return res.json({ ok: false, erro: 'Muitas tentativas. Espere alguns minutos.' });
      const c = await banco.lerConta(nome).catch(() => null);
      if (!c || typeof b.atual !== 'string' || !confereSenha(b.atual, c.senhaHash)) {
        podeTentar(ipDe(req));
        return res.json({ ok: false, erro: 'Senha atual errada.' });
      }
      await banco.trocarSenhaConta(nome, hashSenha(b.nova));
      res.json({ ok: true, token: tokenDe(nome) });
    });

    // os horários de um dia: livre, ocupado, meu (pago), esperando (meu, no checkout) ou passado
    app.post('/lan/horarios', json, async (req, res) => {
      const b = req.body || {};
      const sala = idDaSala(b.sala);
      const conta = contaDoToken(b.token);
      const maquina = maquinaDe(b.maquina);
      const hoje = diaDe(Date.now());
      const dia = /^\d{4}-\d{2}-\d{2}$/.test(b.dia) ? b.dia : hoje;
      const cfg = (await configDaSala(sala)).lanhouse;
      if (!cfg?.ligada) return res.json({ ok: true, ligada: false, sala });
      const agora = Date.now();
      const ultimo = diaDe(agora + DIAS_A_FRENTE * 86400_000);
      const horas = [];
      for (let h = cfg.abre; h < cfg.fecha; h++) {
        const inicio = inicioDaHora(dia, h);
        const r = daHora(sala, maquina, inicio);
        const estado = r ? (r.conta === conta ? (r.status === 'paga' ? 'meu' : 'esperando') : 'ocupado')
          : inicio + HORA <= agora || dia > ultimo ? 'passado' : 'livre';
        horas.push({ inicio, hora: h, estado });
      }
      let p = null;
      try { p = CHAVE ? await lerPreco() : null; } catch { /* mostra sem o preço */ }
      res.json({ ok: true, ligada: true, sala, maquina, maquinas: MAQUINAS, dia, hoje, ultimo, horas, maxHoras: MAX_HORAS, preco: p && { valor: p.valor, moeda: p.moeda, nome: p.nome }, pagar: !!CHAVE, agora: jogadorAgora(sala, maquina) });
    });

    // os jogos do PC da casa, para escolher ao alugar o PC
    app.post('/lan/jogos', json, async (req, res) => {
      const jogos = await jogosDaSala(idDaSala(req.body?.sala)).catch(() => []);
      res.json({ ok: true, jogos });
    });

    // as minhas reservas daqui para a frente
    app.post('/lan/minhas', json, (req, res) => {
      const conta = contaDoToken(req.body?.token);
      if (!conta) return res.json({ ok: false, erro: 'login' });
      const agora = Date.now();
      const lista = [...reservas.values()]
        .filter((r) => r.conta === conta && r.inicio + HORA > agora && (segura(r, agora) || r.status === 'devolver'))
        .sort((a, b) => a.inicio - b.inicio)
        .map((r) => ({ sala: r.sala, maquina: MAQUINAS[maquinaDe(r.maquina)], jogo: r.jogoNome || null, inicio: r.inicio, dia: diaDe(r.inicio), hora: horaDe(r.inicio), status: r.status }));
      res.json({ ok: true, conta, lista });
    });

    // reservar uma ou mais horas (do mesmo dia ou não) e ir pagar
    app.post('/lan/reservar', json, async (req, res) => {
      const b = req.body || {};
      const conta = contaDoToken(b.token);
      if (!conta) return res.json({ ok: false, erro: 'login' });
      if (!CHAVE) return res.json({ ok: false, erro: 'O pagamento ainda não foi configurado nesta sala.' });
      const sala = idDaSala(b.sala);
      const maquina = maquinaDe(b.maquina);
      const cfg = (await configDaSala(sala)).lanhouse;
      if (!cfg?.ligada) return res.json({ ok: false, erro: 'Esta sala não está alugando horários.' });
      // PC: o jogo que abre sozinho no horário (precisa escolher um, se o PC da casa tem a lista)
      let jogo = null;
      if (maquina === 'pc') {
        const jogos = await jogosDaSala(sala);
        jogo = jogos.find((j) => j.id === String(b.jogo ?? '')) || null;
        if (jogos.length && !jogo) return res.json({ ok: false, erro: 'Escolha o jogo que você vai jogar.' });
      }
      const inicios = [...new Set(Array.isArray(b.inicios) ? b.inicios : [])].map(Number);
      if (!inicios.length) return res.json({ ok: false, erro: 'Escolha pelo menos um horário.' });
      if (inicios.length > MAX_HORAS) return res.json({ ok: false, erro: `No máximo ${MAX_HORAS} horas por vez.` });
      const agora = Date.now();
      for (const inicio of inicios) {
        const h = horaDe(inicio);
        const valido = Number.isInteger(inicio) && inicio % HORA === 0 && h >= cfg.abre && h < cfg.fecha
          && inicio + HORA > agora && inicio < agora + (DIAS_A_FRENTE + 1) * 86400_000;
        if (!valido) return res.json({ ok: false, erro: 'Um dos horários não está disponível.' });
        const tem = daHora(sala, maquina, inicio);
        // a própria pessoa no checkout de antes (voltou sem pagar): esse checkout é descartado abaixo
        if (tem && !(tem.conta === conta && tem.status === 'pendente')) return res.json({ ok: false, erro: `As ${h}h do dia ${diaDe(inicio).split('-').reverse().join('/')} acabaram de ser reservadas. Escolha outro horário.` });
      }
      // checkouts antigos desta pessoa com alguma dessas horas: fecha na Stripe (ninguém paga duas
      // vezes) e solta as horas deles
      const velhas = [...reservas.values()].filter((r) => r.conta === conta && r.sala === sala && maquinaDe(r.maquina) === maquina && r.status === 'pendente' && inicios.includes(r.inicio));
      for (const sessao of new Set(velhas.map((r) => r.sessao).filter(Boolean))) {
        try {
          await stripe('POST', `checkout/sessions/${encodeURIComponent(sessao)}/expire`, {});
        } catch (err) {
          // não fechou: já pago, com um Pix em aberto ou já vencido. Só solta se a Stripe confirmar
          const l = await conferirSessao(sessao).catch(() => null);
          if (!l) return res.json({ ok: false, erro: 'Não deu para falar com a Stripe agora. Tente de novo em 1 minuto.' });
          if (l.some((r) => r.status === 'paga')) return res.json({ ok: false, erro: 'Esse horário já foi pago por você. Veja em "Minhas reservas".' });
          const aberta = l.find((r) => r.status === 'pendente');
          if (aberta) {
            const min = Math.max(1, Math.ceil((aberta.expira - Date.now()) / 60_000));
            return res.json({ ok: false, erro: aberta.pixAte
              ? `Você já tem um Pix em aberto para esse horário. Pague por ele ou espere vencer (uns ${min} min) para tentar de novo.`
              : 'O pagamento anterior desse horário ainda está aberto. Tente de novo em 1 minuto.' });
          }
        }
      }
      if (velhas.length) await mudarStatus([...reservas.values()].filter((r) => velhas.some((v) => v.sessao && v.sessao === r.sessao) || velhas.includes(r)), 'cancelada');
      // segura as horas antes de falar com a Stripe: ninguém pega enquanto o checkout abre
      const lista = inicios.map((inicio) => ({
        id: crypto.randomBytes(12).toString('hex'), sala, maquina, conta, inicio, status: 'pendente', sessao: null, expira: agora + ESPERA_CHECKOUT, criada: agora,
        jogo: jogo?.id || null, jogoNome: jogo?.nome || null,
      }));
      for (const r of lista) reservas.set(r.id, r);
      try {
        const p = await lerPreco();
        const origem = origemDe(req);
        const volta = `${origem}/lan?sala=${encodeURIComponent(sala)}`;
        const quando = inicios.sort((a, c) => a - c).map((i) => `${diaDe(i).split('-').reverse().slice(0, 2).join('/')} ${horaDe(i)}h`).join(', ');
        const s = await stripe('POST', 'checkout/sessions', {
          mode: 'payment',
          'line_items[0][price]': p.id,
          'line_items[0][quantity]': String(lista.length),
          success_url: `${volta}&pago={CHECKOUT_SESSION_ID}`,
          cancel_url: `${volta}&cancelado=1`,
          expires_at: String(Math.floor((agora + ESPERA_CHECKOUT) / 1000)),
          'payment_method_options[pix][expires_after_seconds]': String(PIX_MS / 1000),
          client_reference_id: conta,
          'metadata[sala]': sala,
          'metadata[maquina]': MAQUINAS[maquina],
          'metadata[conta]': conta,
          'metadata[horarios]': quando.slice(0, 450),
          ...(jogo ? { 'metadata[jogo]': jogo.nome } : {}),
          'payment_intent_data[description]': `${MAQUINAS[maquina]}${jogo ? ` (${jogo.nome})` : ''} — sala ${sala} — ${conta} — ${quando}`.slice(0, 900),
        });
        for (const r of lista) {
          r.sessao = s.id;
          r.expira = s.expires_at * 1000;
          await guardar(r);
        }
        aoMudar?.(sala);
        res.json({ ok: true, url: s.url });
      } catch (err) {
        for (const r of lista) reservas.delete(r.id);
        console.warn('[lan] checkout', err.message);
        res.json({ ok: false, erro: 'Não deu para abrir o pagamento agora. Tente de novo.' });
      }
    });

    // voltou do checkout: confere com a Stripe na hora
    app.post('/lan/confirmar', json, async (req, res) => {
      const sessao = String(req.body?.sessao ?? '');
      if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessao)) return res.json({ ok: false });
      try {
        const lista = await conferirSessao(sessao);
        if (!lista) return res.json({ ok: false });
        // algumas horas podem ter ficado e outras não (ver tardeDemais): o que vale é o que a pessoa ganhou
        const status = ['paga', 'devolver', 'pendente'].find((x) => lista.some((r) => r.status === x)) || lista[0].status;
        res.json({ ok: true, status, pixAte: lista.find((r) => r.status === 'pendente')?.pixAte || null, devolver: lista.some((r) => r.status === 'devolver'), horas: lista.filter((r) => r.status === status).map((r) => ({ sala: r.sala, maquina: MAQUINAS[maquinaDe(r.maquina)], jogo: r.jogoNome || null, dia: diaDe(r.inicio), hora: horaDe(r.inicio) })) });
      } catch (err) {
        console.warn('[lan] confirmar', err.message);
        res.json({ ok: false, erro: 'Não deu para falar com a Stripe agora. O pagamento é conferido de novo em 1 minuto.' });
      }
    });
  }

  // a vez curta (fimCedo) vira cancelada quando o fim chega
  function vigiarFimCedo(r) {
    const f = r.fimCedo;
    if (f) setTimeout(() => { if (r.fimCedo === f) mudarStatus([r], 'cancelada').catch(() => {}); }, f - Date.now() + 500).unref?.();
  }

  // O dono libera tempo de graça para uma conta: fica "aguardando" (expira = a duração em ms) e só começa a
  // contar quando a pessoa entra na sala (começarLiberadas, chamado no join). Já estando na sala, começa na hora.
  // Quem compra pela Stripe segue igual (a hora cheia). Espera até 2 dias (o que o servidor lê do banco).
  async function liberar({ sala, maquina, conta, horas, minutos, jogo: jogoId }) {
    const nome = limparNome(conta);
    if (!nomeValido(nome)) return { ok: false, erro: 'Nome de conta inválido.' };
    const c = await banco.lerConta(nome).catch(() => null);
    if (!c) return { ok: false, erro: `Não existe a conta "${nome}". Ela precisa entrar uma vez com nome e senha.` };
    const m = maquinaDe(maquina);
    let jogo = null;
    if (m === 'pc' && jogoId) {
      jogo = (await jogosDaSala(sala).catch(() => [])).find((j) => j.id === String(jogoId)) || null;
      if (!jogo) return { ok: false, erro: 'Esse jogo não está na lista do PC da casa.' };
    }
    const min = Math.floor(Number(minutos)) || 0;
    const dur = min > 0 ? Math.min(min, 59) * 60_000 : Math.min(MAX_HORAS, Math.max(1, Math.floor(Number(horas)) || 1)) * HORA;
    const agora = Date.now();
    // liberou de novo antes de ela entrar: soma
    const antes = [...reservas.values()].find((r) => r.status === 'aguardando' && r.sala === sala && maquinaDe(r.maquina) === m && r.conta === nome);
    const r = antes || { id: crypto.randomBytes(12).toString('hex'), sala, maquina: m, conta: nome, inicio: agora, status: 'aguardando', sessao: 'cortesia', expira: 0, criada: agora };
    r.expira += dur;
    if (m === 'pc' && jogo) Object.assign(r, { jogo: jogo.id, jogoNome: jogo.nome });
    reservas.set(r.id, r);
    await guardar(r);
    console.log(`[lan] ${sala} ${MAQUINAS[m]} (${nome}): ${Math.round(r.expira / 60_000)} min liberados, esperando entrar`);
    return { ok: true, conta: nome, maquina: MAQUINAS[m], minutosTotal: Math.round(r.expira / 60_000), jogoNome: r.jogoNome || null };
  }

  // A pessoa entrou: o tempo liberado para ela começa agora (ou no fim da vez dela que já está correndo). Vira
  // reservas pagas de cortesia nas horas cheias, a última com o fim cedo. Hora de outra pessoa no caminho corta
  // o resto; máquina ocupada por outra pessoa agora: continua esperando. Devolve as máquinas que começaram.
  async function comecarLiberadas(sala, conta, agora = Date.now()) {
    const nome = limparNome(conta);
    const comecou = [];
    for (const r of [...reservas.values()].filter((x) => x.status === 'aguardando' && x.sala === sala && x.conta === nome)) {
      const m = maquinaDe(r.maquina);
      const atual = jogadorAgora(sala, m, agora);
      if (atual && atual.conta !== nome) continue;
      let pos = atual ? atual.fim : agora;
      let resto = r.expira;
      const feitas = [];
      while (resto > 0) {
        const s = Math.floor(pos / HORA) * HORA;
        const fimHora = s + HORA;
        const tem = daHora(sala, m, s, agora);
        if (tem && tem.conta !== nome) break;
        // a hora inteira já é dela (comprada): não gasta o liberado
        if (tem && !tem.fimCedo) { pos = fimHora; continue; }
        const ate = Math.min(pos + resto, fimHora);
        // dela com o fim cedo (a vez que acaba em pos): estica
        const x = tem || { id: crypto.randomBytes(12).toString('hex'), sala, maquina: m, conta: nome, inicio: s, status: 'paga', sessao: 'cortesia', criada: agora, jogo: r.jogo || null, jogoNome: r.jogoNome || null };
        if (ate < fimHora) Object.assign(x, { fimCedo: ate, expira: ate });
        else {
          delete x.fimCedo;
          x.expira = fimHora;
        }
        reservas.set(x.id, x);
        await guardar(x);
        vigiarFimCedo(x);
        resto -= ate - pos;
        pos = ate;
        feitas.push(x);
      }
      if (!feitas.length) continue;
      r.status = 'usada';
      await guardar(r);
      console.log(`[lan] ${sala} ${MAQUINAS[m]} (${nome}): entrou, o liberado começa (até ${new Date(pos).toISOString()})`);
      comecou.push(MAQUINAS[m]);
    }
    if (comecou.length) aoMudar?.(sala);
    return comecou;
  }

  // o dono encerra a vez de agora nesta máquina (a hora atual e as seguidas da mesma conta): a máquina
  // fica livre na hora. Não devolve dinheiro de hora paga pela Stripe (isso é com o dono, no painel dela).
  async function encerrar({ sala, maquina }) {
    const m = maquinaDe(maquina);
    const atual = jogadorAgora(sala, m);
    if (!atual) return { ok: false, erro: `Ninguém está com a vez no ${MAQUINAS[m]} agora.` };
    const lista = [];
    for (let h = atual.inicio; h < atual.fim; h += HORA) {
      const r = daHora(sala, m, h);
      if (r && r.conta === atual.conta && r.status === 'paga') lista.push(r);
    }
    for (const r of lista) r.expira = 0; // marca: conferir o pagamento de novo não devolve a vez
    await mudarStatus(lista, 'cancelada');
    return { ok: true, conta: atual.conta, maquina: MAQUINAS[m] };
  }

  return { iniciar, rotas, conferirPendentes, contaDoToken, jogadorAgora, liberar, comecarLiberadas, encerrar, teste, comecarTeste, TESTE_MS, MAQUINAS: Object.keys(MAQUINAS) };
};
