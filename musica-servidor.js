// Música da sala: uma fila do YouTube que todo mundo ouve junto, separada do telão.
//
// O servidor guarda a fila e em que ponto ela está (qual faixa, tocando ou pausada, em que
// segundo); cada navegador toca o áudio num player escondido e acompanha. Para pôr música basta
// colar um link de vídeo ou de playlist, ou digitar um artista ou estilo: o servidor busca no
// próprio YouTube (sem chave de API) e põe 10 na fila. Quando a última acaba, volta para a primeira.

const MAX_FILA = 300;
const VIDEO_RE = /^[\w-]{11}$/;
// playlist pública: PL…, OLAK5uy_…, UU… (mix/rádio "RD…" é por pessoa e não abre fora do YouTube)
const LISTA_RE = /^[\w-]{13,}$/;
const NAVEGADOR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const capa = (v) => `https://i.ytimg.com/vi/${v}/mqdefault.jpg`;
const limpar = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

// o que um link do YouTube aponta: vídeo, playlist ou os dois (vídeo tocando dentro de uma lista)
function lerLink(texto) {
  const raw = String(texto || '').trim();
  if (VIDEO_RE.test(raw)) return { video: raw, lista: null };
  if (/^(PL|OLAK5uy_)[\w-]+$/.test(raw)) return { video: null, lista: raw };
  let url;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host !== 'youtu.be' && !host.endsWith('youtube.com') && !host.endsWith('youtube-nocookie.com')) return null;
  const l = url.searchParams.get('list');
  const lista = l && LISTA_RE.test(l) && !l.startsWith('RD') ? l : null;
  let video = null;
  if (host === 'youtu.be') video = url.pathname.slice(1).split('/')[0];
  else video = url.searchParams.get('v') || url.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/)?.[2] || null;
  if (!VIDEO_RE.test(video || '')) video = null;
  return video || lista ? { video, lista } : null;
}

async function paginaDoYouTube(url) {
  const res = await fetch(url, { headers: NAVEGADOR, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`YouTube respondeu ${res.status}`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  return m ? JSON.parse(m[1]) : null;
}

const segundos = (txt) => String(txt || '').split(':').reduce((a, b) => a * 60 + Number(b), 0);

// busca por artista ou estilo. Primeiro os vídeos de 1:30 a 10 min (uma música); se não der o
// limite, completa com os mais longos (coletânea, lofi) até 3 horas. Live e short ficam de fora.
async function buscar(termo, limite = 10, tentativa = 0) {
  const dados = await paginaDoYouTube(`https://www.youtube.com/results?search_query=${encodeURIComponent(`${termo} música`)}&sp=EgIQAQ%253D%253D&hl=pt-BR&gl=BR`);
  const musicas = [];
  const longas = [];
  const visto = new Set();
  const andar = (no) => {
    if (!no || typeof no !== 'object') return;
    const vr = no.videoRenderer;
    if (vr?.videoId) {
      const s = segundos(vr.lengthText?.simpleText);
      if (!visto.has(vr.videoId) && s >= 90 && s <= 3 * 3600) {
        visto.add(vr.videoId);
        (s <= 600 ? musicas : longas).push({ v: vr.videoId, t: vr.title?.runs?.map((r) => r.text).join('') || 'Música' });
      }
      return;
    }
    for (const filho of Object.values(no)) andar(filho);
  };
  andar(dados);
  // de vez em quando o YouTube devolve a página sem resultados: tenta mais uma vez
  if (!musicas.length && !longas.length && !tentativa) return buscar(termo, limite, 1);
  return [...musicas, ...longas].slice(0, limite);
}

// as músicas de uma playlist pública (a primeira página: até 100)
async function playlist(id) {
  const dados = await paginaDoYouTube(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}&hl=pt-BR`);
  const achou = [];
  const visto = new Set();
  const por = (v, t) => {
    if (VIDEO_RE.test(v || '') && !visto.has(v)) {
      visto.add(v);
      achou.push({ v, t: t || 'Música' });
    }
  };
  const andar = (no) => {
    if (!no || typeof no !== 'object') return;
    const l = no.lockupViewModel;
    if (l) {
      if (l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') por(l.contentId, l.metadata?.lockupMetadataViewModel?.title?.content);
      return;
    }
    const pv = no.playlistVideoRenderer; // o formato de antes, caso o YouTube volte nele
    if (pv) {
      if (pv.isPlayable !== false) por(pv.videoId, pv.title?.runs?.map((r) => r.text).join(''));
      return;
    }
    for (const filho of Object.values(no)) andar(filho);
  };
  andar(dados);
  return achou;
}

// o "Mix" que o YouTube monta a partir de uma música (playlist RD + id): músicas do mesmo estilo.
// As de até 10 min primeiro, para o rádio não emendar uma coletânea de 2 horas.
// Pede pela API interna do site (a mesma que a página chama ao trocar de vídeo): a página
// /watch costuma vir sem a lista para servidor de datacenter (no Render ela voltava vazia).
// Se a API também falhar, tenta a página.
async function mix(v) {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
      method: 'POST',
      headers: { ...NAVEGADOR, 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20260101.00.00', hl: 'pt-BR', gl: 'BR' } }, videoId: v, playlistId: `RD${v}` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const achou = listaDoMix(v, await res.json());
      if (achou.length) return achou;
    }
  } catch { /* tenta a página */ }
  const res = await fetch(`https://www.youtube.com/watch?v=${v}&list=RD${v}&hl=pt-BR&gl=BR`, { headers: NAVEGADOR, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`YouTube respondeu ${res.status}`);
  const m = (await res.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s);
  return m ? listaDoMix(v, JSON.parse(m[1])) : [];
}

function listaDoMix(v, dados) {
  const musicas = [];
  const longas = [];
  const andar = (no) => {
    if (!no || typeof no !== 'object') return;
    const p = no.playlistPanelVideoRenderer;
    if (p) {
      const s = segundos(p.lengthText?.simpleText);
      if (VIDEO_RE.test(p.videoId || '') && p.videoId !== v && s >= 60) {
        (s <= 600 ? musicas : longas).push({ v: p.videoId, t: p.title?.simpleText ?? p.title?.runs?.map((r) => r.text).join('') ?? 'Música' });
      }
      return;
    }
    for (const filho of Object.values(no)) andar(filho);
  };
  andar(dados);
  return [...musicas, ...longas];
}

// o artista de um título "Artista - Música (Clipe Oficial)", para o rádio buscar quando o Mix falha
const artistaDo = (titulo) => String(titulo).split(/\s[-–|]\s/)[0].replace(/\(.*?\)|\[.*?\]/g, '').trim().slice(0, 60);

// título de um vídeo só (o oEmbed é público e não pede chave)
async function umVideo(v) {
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v}`)}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Vídeo não disponível ou é privado.');
  const d = await res.json();
  return { v, t: d.title || 'Música' };
}

// telao: o telão da sala a serviço da música (server.js) — carregar(room, v, tempo, tocando),
// tocar(room, tocando, tempo), parar(room) e agora(room) → { v, tempo, tocando }.
function ligarMusica(io, telao) {
  const musicaDa = (room) => (room.musica ||= { fila: [], idx: 0, tocando: false, tempo: 0, em: Date.now(), por: null, seq: 0, n: 0, telao: false });
  const tempoAgora = (m) => (m.tocando ? m.tempo + (Date.now() - m.em) / 1000 : m.tempo);

  // comFila: a fila mudou (senão vai só o ponto da música, que é o que muda a toda hora)
  const publico = (m, comFila) => ({
    ...(comFila ? { fila: m.fila } : {}),
    idx: m.idx, tocando: m.tocando, tempo: tempoAgora(m), por: m.por, seq: m.seq, agora: Date.now(), telao: !!m.telao,
  });
  const avisar = (room, comFila = false) => {
    const m = musicaDa(room);
    if (m.telao) acompanharTelao(room, m);
    io.to(room.id).emit('mu-estado', publico(m, comFila));
  };

  // Música no telão: o clipe da faixa atual toca no telão da sala (com o som), e a fila segue por
  // ele — acabou o clipe, entra a próxima; na última, o rádio já busca uma parecida, e assim não
  // para nunca. Enquanto isso o player escondido de cada um fica calado (telao no estado).
  // Faixa nova (seq): vai para o telão. Fila vazia: o telão para e o modo acaba.
  function acompanharTelao(room, m) {
    const a = m.fila[m.idx];
    if (!a) {
      m.telao = false;
      telao.parar(room);
      return;
    }
    if (m.telaoSeq === m.seq) return;
    m.telaoSeq = m.seq;
    telao.carregar(room, a.v, tempoAgora(m), m.tocando);
    if (m.idx === m.fila.length - 1) radio(room, m, m.seq);
  }
  // o tempo e o play/pause da música passam a ser os do telão (alguém mexeu no player dele)
  function doTelao(room, m) {
    const t = telao.agora(room);
    m.tempo = t.tempo;
    m.tocando = t.tocando;
    m.em = Date.now();
  }

  // Rádio: a última da fila está acabando; entra uma do Mix dela que ainda não está na fila. Assim
  // a música não para nem volta para a primeira. O seq faz buscar uma vez só por faixa.
  async function radio(room, m, seq) {
    if (!m.fila.length || seq !== m.seq || m.radioSeq === m.seq || m.idx !== m.fila.length - 1) return;
    m.radioSeq = m.seq;
    const ultima = m.fila[m.idx];
    try {
      let achou = await mix(ultima.v).catch((err) => {
        console.warn('  Música: o rádio não leu o mix do YouTube:', err.message);
        return [];
      });
      // sem Mix: busca pelo artista da última (a busca funciona onde o Mix não abre)
      if (!achou.length) achou = await buscar(artistaDo(ultima.t), 15);
      // enquanto buscava, alguém pôs música (ou apagou a fila): aí não precisa mais
      if (m.fila.at(-1) !== ultima) return;
      const naFila = new Set(m.fila.map((x) => x.v));
      const nova = achou.find((x) => !naFila.has(x.v));
      if (nova) enfileirar(room, { name: 'Rádio' }, [nova]);
    } catch (err) {
      console.warn('  Música: o rádio não achou música parecida:', err.message);
    }
  }

  // troca de faixa: seq novo, e o "acabou"/"deu erro" da faixa anterior não pula esta
  function irPara(m, i, tocando = true) {
    m.idx = m.fila.length ? ((i % m.fila.length) + m.fila.length) % m.fila.length : 0;
    m.tocando = tocando && m.fila.length > 0;
    m.tempo = 0;
    m.em = Date.now();
    m.seq++;
  }

  // põe no fim da fila; fila vazia (ou "tocar já", da busca) começa pela primeira que entrou
  function enfileirar(room, user, videos, tocarJa = false) {
    const m = musicaDa(room);
    const cabe = Math.max(0, MAX_FILA - m.fila.length);
    const novas = videos.slice(0, cabe).map((x) => ({ id: ++m.n, v: x.v, t: limpar(x.t, 160), por: user.name }));
    if (!novas.length) return 0;
    const primeira = m.fila.length;
    const vazia = !m.fila.length;
    m.fila.push(...novas);
    m.por = user.name;
    if (vazia || tocarJa) irPara(m, primeira);
    avisar(room, true);
    return novas.length;
  }

  // O que acontece no telão e importa para a música (server.js chama, no 'media'):
  // acabou: o clipe chegou ao fim (já filtrado: uma vez só) — entra a próxima.
  // erro: o clipe não toca no telão (sem embed, privado) — pula, uma vez por faixa.
  // mexeu: play, pause ou seek pelo player do telão — a aba Música acompanha.
  // trocou: alguém pôs outra coisa no telão (ou parou) — a música sai dele e fica pausada.
  const doTelaoParaMusica = {
    acabou(room, v) {
      const m = room.musica;
      if (!m?.telao || m.fila[m.idx]?.v !== v) return;
      irPara(m, m.idx + 1);
      avisar(room);
    },
    erro(room, v) {
      const m = room.musica;
      if (!m?.telao || m.fila[m.idx]?.v !== v || m.erroSeq === m.seq) return;
      m.erroSeq = m.seq;
      irPara(m, m.idx + 1);
      avisar(room);
    },
    mexeu(room) {
      const m = room.musica;
      if (!m?.telao) return;
      doTelao(room, m);
      io.to(room.id).emit('mu-estado', publico(m, false));
    },
    trocou(room) {
      const m = room.musica;
      if (!m?.telao) return;
      m.telao = false;
      m.tocando = false;
      m.em = Date.now();
      io.to(room.id).emit('mu-estado', publico(m, false));
    },
  };

  return Object.assign(function porSocket(socket, quemDaSala) {
    const daSala = () => {
      const { room, user } = quemDaSala();
      return room && user ? { room, user, m: musicaDa(room) } : {};
    };
    let ultimaBusca = 0;

    socket.on('mu-ver', (ack) => {
      const { m } = daSala();
      ack?.(m ? publico(m, true) : null);
    });

    // texto: link de vídeo/playlist ou o nome de um artista/estilo. modo: 'video' ou 'lista' quando
    // o link tem os dois (sem modo, a resposta pede para a pessoa escolher).
    socket.on('mu-adicionar', async (msg, ack) => {
      const { room, user, m } = daSala();
      if (!m || typeof ack !== 'function') return;
      const texto = limpar(msg?.texto, 300);
      if (!texto) return ack({ erro: 'Cole um link do YouTube ou digite um artista ou estilo.' });
      if (m.fila.length >= MAX_FILA) return ack({ erro: `A fila já tem ${MAX_FILA} músicas. Apague algumas antes.` });
      const agora = Date.now();
      if (agora - ultimaBusca < 1500) return ack({ erro: 'Calma: uma de cada vez.' });
      ultimaBusca = agora;
      try {
        const link = lerLink(texto);
        if (!link) {
          if (/^https?:|youtu/i.test(texto)) return ack({ erro: 'Cole um link válido de vídeo ou playlist do YouTube.' });
          const achou = await buscar(texto.slice(0, 100));
          if (!achou.length) return ack({ erro: `Nada encontrado para "${texto}".` });
          const n = enfileirar(room, user, achou, true);
          socket.to(room.id).emit('mu-aviso', { texto: `${user.name} pôs ${texto} para tocar (${n} músicas)` });
          return ack({ ok: n, busca: texto });
        }
        if (link.video && link.lista && !msg?.modo) return ack({ escolher: true });
        if (link.lista && (msg?.modo === 'lista' || !link.video)) {
          const achou = await playlist(link.lista);
          if (!achou.length) return ack({ erro: 'Não deu para ler a playlist. Confira se ela é pública.' });
          const n = enfileirar(room, user, achou);
          socket.to(room.id).emit('mu-aviso', { texto: `${user.name} pôs uma playlist na fila (${n} músicas)` });
          return ack({ ok: n, lista: true });
        }
        const video = await umVideo(link.video);
        const n = enfileirar(room, user, [video]);
        if (n) socket.to(room.id).emit('mu-aviso', { texto: `${user.name} pôs na fila: ${video.t}` });
        return ack({ ok: n });
      } catch (err) {
        console.warn('  Música: falhou ao buscar no YouTube:', err.message);
        ack({ erro: err.message.includes('privado') ? err.message : 'O YouTube não respondeu. Tente de novo daqui a pouco.' });
      }
    });

    socket.on('mu-tocar', (msg) => {
      const { room, user, m } = daSala();
      const i = m?.fila.findIndex((x) => x.id === msg?.id) ?? -1;
      if (i < 0) return;
      irPara(m, i);
      m.por = user.name;
      avisar(room);
    });

    socket.on('mu-pular', (msg) => {
      const { room, user, m } = daSala();
      if (!m?.fila.length) return;
      irPara(m, m.idx + (msg?.dir === -1 ? -1 : 1));
      m.por = user.name;
      avisar(room);
    });

    socket.on('mu-play', (msg) => {
      const { room, user, m } = daSala();
      if (!m?.fila.length) return;
      const t = Number(msg?.tempo);
      // no telão quem sabe o segundo certo é ele
      if (m.telao) doTelao(room, m);
      else m.tempo = Number.isFinite(t) && t >= 0 ? t : tempoAgora(m);
      m.tocando = !!msg?.tocando;
      m.em = Date.now();
      m.por = user.name;
      if (m.telao) telao.tocar(room, m.tocando, m.tempo);
      avisar(room);
    });

    socket.on('mu-seek', (msg) => {
      const { room, user, m } = daSala();
      const t = Number(msg?.tempo);
      if (!m?.fila.length || !Number.isFinite(t)) return;
      m.tempo = Math.max(0, t);
      m.em = Date.now();
      m.por = user.name;
      if (m.telao) telao.tocar(room, m.tocando, m.tempo);
      avisar(room);
    });

    // a faixa acabou (ou não toca: privada, removida, sem embed) no navegador de alguém. Todos
    // avisam; o seq garante que pula uma vez só, e o tempo, que um aviso atrasado não corta a próxima.
    socket.on('mu-fim', (msg) => {
      const { room, m } = daSala();
      if (!m?.fila.length || msg?.seq !== m.seq || m.telao) return; // no telão quem avisa é ele
      if (!msg.erro && tempoAgora(m) < 3) return;
      irPara(m, m.idx + 1);
      avisar(room);
    });

    // Rádio: a última da fila está nos 30 s finais (quem avisa é o navegador, que sabe a duração).
    // Todos avisam: o seq faz buscar uma vez só por faixa. (No telão ele busca ao começar a última.)
    socket.on('mu-radio', (msg) => {
      const { room, m } = daSala();
      if (m) radio(room, m, msg?.seq);
    });

    // liga (com o segundo em que a música está) ou desliga a música no telão. Desligando, a música
    // volta para o player escondido de cada um no ponto em que o telão estava.
    socket.on('mu-telao', (msg) => {
      const { room, user, m } = daSala();
      if (!m?.fila.length) return;
      if (msg?.ligar) {
        const t = Number(msg.tempo);
        m.tempo = Number.isFinite(t) && t >= 0 ? t : tempoAgora(m);
        m.tocando = true;
        m.em = Date.now();
        m.telao = true;
        m.telaoSeq = null;
      } else {
        if (!m.telao) return;
        doTelao(room, m);
        m.telao = false;
        telao.parar(room);
      }
      m.por = user.name;
      avisar(room);
    });

    socket.on('mu-tirar', (msg) => {
      const { room, user, m } = daSala();
      if (!m || !Array.isArray(msg?.ids)) return;
      const tirar = new Set(msg.ids);
      const atual = m.fila[m.idx];
      // apagou a que tocava: segue para a primeira que sobrou depois dela
      const seguinte = m.fila.slice(m.idx).find((x) => !tirar.has(x.id)) ?? null;
      m.fila = m.fila.filter((x) => !tirar.has(x.id));
      m.por = user.name;
      if (!atual || !tirar.has(atual.id)) m.idx = Math.max(0, m.fila.indexOf(atual)); // só muda de posição
      else irPara(m, seguinte ? m.fila.indexOf(seguinte) : 0, m.tocando);
      avisar(room, true);
    });

    socket.on('mu-limpar', () => {
      const { room, user, m } = daSala();
      if (!m?.fila.length) return;
      m.fila = [];
      irPara(m, 0, false);
      m.por = user.name;
      avisar(room, true);
    });
  }, { doTelao: doTelaoParaMusica });
}

module.exports = { ligarMusica, lerLink };
