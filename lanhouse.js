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
const TOKEN_DIAS = 30;

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

  // ---------------------------------------------------------- reservas
  // a hora está tomada por uma paga ou por alguém que está no checkout agora
  const segura = (r, agora = Date.now()) => r.status === 'paga' || (r.status === 'pendente' && r.expira > agora);
  const daHora = (sala, maquina, inicio) => [...reservas.values()].find((r) => r.sala === sala && maquinaDe(r.maquina) === maquina && r.inicio === inicio && segura(r));

  // quem joga agora nesta máquina da sala: { conta, inicio, fim } (horas pagas seguidas da mesma conta viram uma só)
  function jogadorAgora(sala, maquina = 'pc', agora = Date.now()) {
    const h = Math.floor(agora / HORA) * HORA;
    const r = daHora(sala, maquina, h);
    if (!r || r.status !== 'paga') return null;
    // liberação curta (teste do dono, ver liberar com minutos): acaba antes da hora cheia
    if (r.fimCedo) return agora >= r.fimCedo ? null : { conta: r.conta, inicio: h, fim: r.fimCedo, jogo: r.jogo || null, jogoNome: r.jogoNome || null };
    let fim = h + HORA;
    while (daHora(sala, maquina, fim)?.conta === r.conta && daHora(sala, maquina, fim).status === 'paga') fim += HORA;
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

  // pergunta à Stripe como está a sessão e acerta as reservas dela
  async function conferirSessao(sessao) {
    const lista = [...reservas.values()].filter((r) => r.sessao === sessao);
    if (!lista.length) return null;
    const s = await stripe('GET', `checkout/sessions/${encodeURIComponent(sessao)}`);
    if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') await mudarStatus(lista, 'paga');
    else if (s.status === 'expired') await mudarStatus(lista, 'cancelada');
    // pagamento que ainda vai cair (boleto etc.): segura a hora até ela começar
    else if (s.status === 'complete') {
      for (const r of lista) if (r.status === 'pendente') r.expira = Math.max(r.expira, r.inicio);
    }
    return lista;
  }

  let conferindo = false;
  async function conferirPendentes() {
    if (conferindo || !CHAVE) return;
    conferindo = true;
    try {
      const agora = Date.now();
      const sessoes = new Set([...reservas.values()].filter((r) => r.status === 'pendente' && r.sessao).map((r) => r.sessao));
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
      for (const r of await banco.lerReservas(Date.now() - 2 * 86400_000)) reservas.set(r.id, r);
    } catch (err) {
      console.warn('[lan] lendo reservas', err.code || err.message);
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
        .filter((r) => r.conta === conta && r.inicio + HORA > agora && segura(r, agora))
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
          // já pago nesse meio-tempo? confere antes de soltar
          const l = await conferirSessao(sessao).catch(() => null);
          if (l?.[0]?.status === 'paga') return res.json({ ok: false, erro: 'Esse horário já foi pago por você. Veja em "Minhas reservas".' });
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
        res.json({ ok: true, status: lista[0].status, horas: lista.map((r) => ({ sala: r.sala, maquina: MAQUINAS[maquinaDe(r.maquina)], jogo: r.jogoNome || null, dia: diaDe(r.inicio), hora: horaDe(r.inicio) })) });
      } catch (err) {
        console.warn('[lan] confirmar', err.message);
        res.json({ ok: false, erro: 'Não deu para falar com a Stripe agora. O pagamento é conferido de novo em 1 minuto.' });
      }
    });
  }

  // o dono libera horas de graça para uma conta (sem Stripe): a partir da hora cheia de agora,
  // seguidas. Hora que já é de outra pessoa (paga ou no checkout) fica de fora.
  async function liberar({ sala, maquina, conta, horas, minutos }) {
    const nome = limparNome(conta);
    if (!nomeValido(nome)) return { ok: false, erro: 'Nome de conta inválido.' };
    const c = await banco.lerConta(nome).catch(() => null);
    if (!c) return { ok: false, erro: `Não existe a conta "${nome}". Ela precisa entrar uma vez com nome e senha.` };
    const m = maquinaDe(maquina);
    // Teste do dono: alguns minutos a partir de agora (a vez começa e acaba sem esperar a hora cheia).
    // O fim curto fica só na memória; quando chega, a reserva vira cancelada (também no banco).
    const min = Math.floor(Number(minutos)) || 0;
    if (min > 0) {
      const agora = Date.now();
      const h0 = Math.floor(agora / HORA) * HORA;
      const fimCedo = Math.min(agora + Math.min(min, 59) * 60_000, h0 + HORA);
      let r = daHora(sala, m, h0);
      if (r && r.conta !== nome) return { ok: false, erro: `O ${MAQUINAS[m]} já é de ${r.conta} nesta hora.` };
      if (!r) {
        r = { id: crypto.randomBytes(12).toString('hex'), sala, maquina: m, conta: nome, inicio: h0, status: 'paga', sessao: 'cortesia', expira: h0 + HORA, criada: agora, jogo: null, jogoNome: null };
        reservas.set(r.id, r);
      }
      r.status = 'paga';
      r.fimCedo = fimCedo;
      await guardar(r);
      setTimeout(() => { if (r.fimCedo === fimCedo) mudarStatus([r], 'cancelada').catch(() => {}); }, fimCedo - agora + 500).unref?.();
      console.log(`[lan] ${sala} ${MAQUINAS[m]} (${nome}): teste de ${min} min, até ${new Date(fimCedo).toISOString()}`);
      aoMudar?.(sala);
      return { ok: true, conta: nome, maquina: MAQUINAS[m], horas: [], minutos: min, pulou: [] };
    }
    const n = Math.min(MAX_HORAS, Math.max(1, Math.floor(Number(horas)) || 1));
    const agora = Date.now();
    const h0 = Math.floor(agora / HORA) * HORA;
    const lista = [];
    const pulou = [];
    for (let i = 0; i < n; i++) {
      const inicio = h0 + i * HORA;
      const tem = daHora(sala, m, inicio);
      if (tem && tem.conta !== nome) { pulou.push(horaDe(inicio)); continue; }
      if (tem?.status === 'paga') continue; // já é dela
      if (tem) { tem.status = 'cancelada'; await guardar(tem); } // o checkout dela mesma: vira cortesia
      lista.push({
        id: crypto.randomBytes(12).toString('hex'), sala, maquina: m, conta: nome, inicio, status: 'paga', sessao: 'cortesia', expira: inicio + HORA, criada: agora,
        jogo: null, jogoNome: null,
      });
    }
    for (const r of lista) {
      reservas.set(r.id, r);
      await guardar(r);
      console.log(`[lan] ${sala} ${MAQUINAS[m]} ${diaDe(r.inicio)} ${horaDe(r.inicio)}h (${nome}): cortesia do dono`);
    }
    aoMudar?.(sala);
    return { ok: true, conta: nome, maquina: MAQUINAS[m], horas: lista.map((r) => horaDe(r.inicio)), pulou };
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
    await mudarStatus(lista, 'cancelada');
    return { ok: true, conta: atual.conta, maquina: MAQUINAS[m] };
  }

  return { iniciar, rotas, contaDoToken, jogadorAgora, liberar, encerrar, MAQUINAS: Object.keys(MAQUINAS) };
};
