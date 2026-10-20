// Sinuca (bola 8) no salão de jogos do parque: o servidor manda na vez, nas regras e nas bolas.
//
// Como no boliche (quadras-servidor.js): quem está na vez manda só a direção e a força da tacada; o
// servidor simula tudo (a mesma conta do navegador, sinuca-fisica.js), confere o que caiu e decide
// falta, grupo (lisas ou listradas), quem joga a seguir e quem venceu. Todo mundo anima a mesma
// tacada e, no fim, as bolas ficam onde o servidor disse.
// Regras: na saída a mesa está aberta; a primeira bola encaçapada depois decide o grupo de cada um.
// Falta (a branca cair, não tocar em nada ou tocar primeiro na bola errada) passa a vez e a branca
// volta para a marca. Encaçapou bola sua sem falta, joga de novo. A 8 só no fim: antes, perde.
// Sozinho na mesa é treino: sem vez e sem falta, a 8 que cai antes da hora volta para o pé da mesa.

let F = null;
import('./public/js/sinuca-fisica.js')
  .then((m) => { F = m; })
  .catch((err) => console.warn('  Física da sinuca não carregou:', err.message));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const ondeEsta = (user) => (user?.p ? { x: user.p[0], y: user.p[1], z: user.p[2] } : null);
const embaralhar = (lista) => {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
};
const triangulo = () => F.arrumarTriangulo(embaralhar([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]));

const novaMesa = (i) => ({ i, jogadores: [], vez: 0, fase: 'espera', bolas: triangulo(), saida: true, ate: 0, vencedor: null, aviso: '', desde: Date.now() });
const mesasDa = (room) => (room.sinuca ||= F.SINUCA.mesas.map((_, i) => novaMesa(i)));

// longe da mesa há mais de 3 s (a posição que o servidor tem chega um tiquinho depois de um teleporte)
const longeDemais = (j, longe) => {
  if (!longe) {
    j.longeDesde = 0;
    return false;
  }
  j.longeDesde ||= Date.now();
  return Date.now() - j.longeDesde > 3000;
};
const doGrupo = (n, g) => (g === 'lisas' ? F.lisa(n) : g === 'listradas' ? F.listrada(n) : false);
const bolasPublicas = (bolas) => bolas.map((b) => [b.n, b.x, b.z, b.fora ? 1 : 0]);
const mesaPublica = (m) => ({
  mesa: m.i, fase: m.fase, vez: m.vez, saida: m.saida, vencedor: m.vencedor, aviso: m.aviso,
  jogadores: m.jogadores.map(({ id, nome, cor, grupo }) => ({ id, nome, cor, grupo })),
  bolas: bolasPublicas(m.bolas),
});

function ligarSinuca(io, rooms, jogoLigado, darMoedas) {
  const avisar = (room, m) => io.to(room.id).emit('sn-estado', mesaPublica(m));

  function mesaNova(room, m, aviso = '') {
    m.bolas = triangulo();
    m.saida = true;
    m.vencedor = null;
    m.aviso = aviso;
    m.fase = m.jogadores.length ? 'jogando' : 'espera';
    m.vez = m.jogadores.length === 2 ? Math.floor(Math.random() * 2) : 0;
    for (const j of m.jogadores) j.grupo = null;
    m.desde = Date.now();
    avisar(room, m);
  }

  function sair(room, id) {
    for (const m of room.sinuca || []) {
      const k = m.jogadores.findIndex((j) => j.id === id);
      if (k < 0) continue;
      m.jogadores.splice(k, 1);
      // quem ficou continua sozinho (treino), com a mesa arrumada de novo
      mesaNova(room, m, m.jogadores.length ? 'Treino: jogue à vontade' : '');
    }
  }

  // depois da simulação: falta, grupo, a 8, de quem é a vez
  function julgar(room, m, ev, limpouAntes) {
    const treino = m.jogadores.length < 2;
    const eu = m.jogadores[m.vez];
    const outro = m.jogadores[1 - m.vez];
    const caidas = ev.caidas;
    const branca = caidas.includes(0);
    const oito = caidas.includes(8);
    let falta = '';
    if (branca) falta = 'a branca caiu';
    else if (ev.primeira === null) falta = 'não tocou em nenhuma bola';
    else if (!treino && eu.grupo && (limpouAntes ? ev.primeira !== 8 : !doGrupo(ev.primeira, eu.grupo))) falta = 'tocou primeiro na bola errada';
    else if (!treino && !eu.grupo && ev.primeira === 8 && !m.saida) falta = 'tocou primeiro na 8';
    if (branca) F.devolverBranca(m.bolas);
    m.aviso = falta ? `Falta: ${falta}` : '';

    if (oito) {
      const oitoBola = m.bolas.find((b) => b.n === 8);
      const resto = m.bolas.some((b) => !b.fora && b.n !== 0 && b.n !== 8);
      if (treino) {
        if (resto) {
          // treino: a 8 volta para o pé da mesa
          Object.assign(oitoBola, { fora: false, x: F.SINUCA.comp / 4, z: 0, vx: 0, vz: 0 });
          m.aviso = 'A 8 volta para o pé da mesa';
        } else {
          m.fase = 'fim';
          m.vencedor = eu.id;
          m.aviso = 'Mesa limpa!';
          m.ate = Date.now() + 5000;
          return;
        }
      } else if (m.saida && !falta) {
        Object.assign(oitoBola, { fora: false, x: F.SINUCA.comp / 4, z: 0, vx: 0, vz: 0 });
        m.aviso = 'A 8 caiu na saída: volta para o pé da mesa';
      } else {
        const ganhou = limpouAntes && !falta ? eu : outro;
        m.fase = 'fim';
        m.vencedor = ganhou.id;
        m.aviso = ganhou === eu ? `${eu.nome} encaçapou a 8!` : `${eu.nome} encaçapou a 8 antes da hora`;
        m.ate = Date.now() + 7000;
        const u = room.users.get(ganhou.id);
        if (u) darMoedas?.(room, u, 25, 'vitória na sinuca');
        return;
      }
    }
    if (treino) {
      m.saida = false;
      if (!m.bolas.some((b) => !b.fora && b.n !== 0)) {
        m.fase = 'fim';
        m.vencedor = eu.id;
        m.aviso = 'Mesa limpa!';
        m.ate = Date.now() + 5000;
      }
      return;
    }
    // mesa aberta: a primeira bola que caiu (depois da saída) decide os grupos
    if (!eu.grupo && !falta && !m.saida) {
      const primeira = caidas.find((n) => n !== 0 && n !== 8);
      if (primeira) {
        eu.grupo = F.lisa(primeira) ? 'lisas' : 'listradas';
        outro.grupo = eu.grupo === 'lisas' ? 'listradas' : 'lisas';
        m.aviso = `${eu.nome} fica com as ${eu.grupo}`;
      }
    }
    const minha = caidas.some((n) => n !== 0 && n !== 8 && (eu.grupo ? doGrupo(n, eu.grupo) : true));
    m.saida = false;
    if (falta || !minha) m.vez = 1 - m.vez;
  }

  // a tacada terminou de rolar (para todos): libera a próxima
  setInterval(() => {
    if (!F) return;
    const agora = Date.now();
    for (const room of rooms.values()) {
      for (const m of room.sinuca || []) {
        if (m.fase === 'rolando' && agora >= m.ate) {
          m.fase = 'jogando';
          m.desde = agora;
          avisar(room, m);
        } else if (m.fase === 'fim' && agora >= m.ate) {
          mesaNova(room, m);
        } else if (m.fase === 'jogando' && m.jogadores.length === 2 && agora - m.desde > 75_000) {
          // parado demais na vez: passa
          m.vez = 1 - m.vez;
          m.desde = agora;
          m.aviso = 'Demorou: a vez passou';
          avisar(room, m);
        }
        // quem se afastou da mesa deixa o lugar
        const mesa = F.SINUCA.mesas[m.i];
        for (const j of [...m.jogadores]) {
          const p = ondeEsta(room.users.get(j.id));
          if (!jogoLigado(room, 'sinuca') || longeDemais(j, !p || Math.hypot(p.x - mesa.x, p.z - mesa.z) > 14)) sair(room, j.id);
        }
      }
    }
  }, 250);

  return function porSocket(socket, quem) {
    const daSala = () => {
      const { room, user } = quem();
      if (!room || !user || !F) return {};
      return { room, user, mesas: mesasDa(room) };
    };

    socket.on('sn-ver', (ack) => {
      const { mesas } = daSala();
      ack?.(mesas ? mesas.map(mesaPublica) : null);
    });

    socket.on('sn-entrar', (msg, ack) => {
      const { room, user, mesas } = daSala();
      if (!mesas || !jogoLigado(room, 'sinuca')) return ack?.({ erro: 'desligado' });
      const m = mesas[msg?.mesa];
      if (!m) return ack?.({ erro: 'mesa' });
      if (m.jogadores.some((j) => j.id === user.id)) return ack?.({ erro: 'ja' });
      if (m.jogadores.length >= 2) return ack?.({ erro: 'cheia' });
      sair(room, user.id);
      m.jogadores.push({ id: user.id, nome: user.name, cor: user.color, grupo: null });
      mesaNova(room, m, m.jogadores.length === 2 ? 'Partida nova!' : 'Treino: jogue à vontade');
      ack?.({ ok: true });
    });

    socket.on('sn-sair', () => {
      const { room, user } = quem();
      if (room?.sinuca && user) sair(room, user.id);
    });

    // a tacada: ângulo (no plano da mesa) e força de 0 a 1
    socket.on('sn-tacada', (msg) => {
      const { room, user, mesas } = daSala();
      if (!mesas || !jogoLigado(room, 'sinuca')) return;
      const m = mesas[msg?.mesa];
      const ang = num(msg?.ang);
      const forca = num(msg?.forca);
      if (!m || ang === null || forca === null || m.fase !== 'jogando' || m.jogadores[m.vez]?.id !== user.id) return;
      const S = F.SINUCA;
      const vel = 0.35 + Math.max(0, Math.min(1, forca)) * (S.forcaMax - 0.35);
      const vx = Math.cos(ang) * vel;
      const vz = Math.sin(ang) * vel;
      const eu = m.jogadores[m.vez];
      const limpouAntes = !!eu.grupo && !m.bolas.some((b) => !b.fora && doGrupo(b.n, eu.grupo));
      const antes = bolasPublicas(m.bolas);
      const ev = F.simularSinuca(m.bolas, vx, vz);
      for (const b of m.bolas) b.vx = b.vz = 0;
      const depoisDaTacada = bolasPublicas(m.bolas); // antes de a branca ou a 8 voltarem
      julgar(room, m, ev, limpouAntes);
      if (m.fase !== 'fim') m.fase = 'rolando';
      m.ate = m.fase === 'fim' ? Math.max(m.ate, Date.now() + ev.tempo * 1000 + 4000) : Date.now() + ev.tempo * 1000 + 700;
      io.to(room.id).emit('sn-lance', { mesa: m.i, vx, vz, antes, depoisDaTacada, nome: user.name, id: user.id, caidas: ev.caidas });
      avisar(room, m);
    });

    socket.on('disconnect', () => {
      const { room, user } = quem();
      if (room?.sinuca && user) sair(room, user.id);
    });
  };
}

module.exports = { ligarSinuca };
