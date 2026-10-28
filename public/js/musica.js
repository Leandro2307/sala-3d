// Música da sala (a aba "Música" do painel): uma fila do YouTube que todo mundo ouve junto,
// separada do telão. Quem manda na fila é o servidor (musica-servidor.js); aqui cada um toca o
// áudio num player do YouTube escondido, acompanha a faixa e o segundo, e desenha a aba.
import { loadYouTubeApi } from './media.js';
import { icon } from './icons.js';

const $ = (s) => document.querySelector(s);
const capa = (v) => `https://i.ytimg.com/vi/${v}/mqdefault.jpg`;
const mmss = (t) => {
  t = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
// mais que isso fora do ponto da sala, o player pula para o lugar certo
const DESVIO = 2.5;

export class Musica {
  constructor({ socket, toast, volume, aoMudarVolume, painelAberto, noTelao }) {
    this.socket = socket;
    this.toast = toast;
    this.volume = volume;
    this.painelAberto = painelAberto;
    this.fila = [];
    this.idx = 0;
    this.tocando = false;
    this.tempo = 0; // segundo da faixa quando o estado chegou
    this.recebido = performance.now();
    this.seq = -1;
    this.por = null;
    this.player = null; // YT.Player, criado na primeira música
    this.carregado = null; // "seq:videoId" que está no player
    this.selecionadas = new Set();
    this.ocupado = false;
    this.conta = 0;
    this.escolha = null; // texto de um link com vídeo e playlist: a pessoa escolhe o que entra

    $('#mu-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.adicionar($('#mu-texto').value);
    });
    $('#mu-texto').addEventListener('input', () => this.mostrarEscolha(null));
    $('#mu-so-video').addEventListener('click', () => this.adicionar(this.escolha, 'video'));
    $('#mu-lista-toda').addEventListener('click', () => this.adicionar(this.escolha, 'lista'));
    for (const b of document.querySelectorAll('#mu-estilos [data-estilo]')) {
      b.addEventListener('click', () => this.adicionar(b.dataset.estilo));
    }
    $('#mu-play').addEventListener('click', () => {
      if (!this.fila.length) return;
      this.socket()?.emit('mu-play', { tocando: !this.tocando, tempo: this.agora() });
    });
    // o clipe vai para o telão no mesmo segundo, e a música da sala pausa (senão tocariam as duas)
    $('#mu-telao').addEventListener('click', () => {
      const a = this.atual();
      if (!a) return;
      const t = this.agora();
      if (!noTelao(a.v, t)) return;
      if (this.tocando) this.socket()?.emit('mu-play', { tocando: false, tempo: t });
      this.toast('Clipe no telão. A música da sala pausou.', 'info', 3500, '#f472b6');
    });
    $('#mu-ant').addEventListener('click', () => this.socket()?.emit('mu-pular', { dir: -1 }));
    $('#mu-prox').addEventListener('click', () => this.socket()?.emit('mu-pular', { dir: 1 }));
    $('#mu-barra').addEventListener('click', (e) => {
      const dur = this.duracao();
      if (!dur) return;
      const r = e.currentTarget.getBoundingClientRect();
      this.socket()?.emit('mu-seek', { tempo: ((e.clientX - r.left) / r.width) * dur });
    });
    const vol = $('#mu-volume');
    vol.value = volume();
    vol.addEventListener('input', () => {
      aoMudarVolume(Number(vol.value));
      try { this.player?.setVolume(Number(vol.value)); } catch { /* ainda não pronto */ }
    });

    $('#mu-todas').addEventListener('change', (e) => {
      this.selecionadas = e.target.checked ? new Set(this.fila.map((x) => x.id)) : new Set();
      this.desenharFila();
    });
    $('#mu-apagar-sel').addEventListener('click', () => {
      if (!this.selecionadas.size) return;
      this.socket()?.emit('mu-tirar', { ids: [...this.selecionadas] });
      this.selecionadas.clear();
    });
    // apagar tudo pede um segundo toque (sem confirm(), que trava o jogo)
    const tudo = $('#mu-apagar-tudo');
    tudo.addEventListener('click', () => {
      if (tudo.dataset.confirmar) {
        clearTimeout(this.confirmarTudo);
        delete tudo.dataset.confirmar;
        this.socket()?.emit('mu-limpar');
        this.desenharFila();
        return;
      }
      tudo.dataset.confirmar = '1';
      tudo.innerHTML = `${icon('lixo', 14)}Toque de novo para apagar ${this.fila.length}`;
      this.confirmarTudo = setTimeout(() => {
        delete tudo.dataset.confirmar;
        this.desenharFila();
      }, 3500);
    });
    $('#mu-fila').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (!li) return;
      const id = Number(li.dataset.id);
      if (e.target.closest('.mu-tirar')) return this.socket()?.emit('mu-tirar', { ids: [id] });
      if (e.target.closest('.mu-marcar')) {
        if (e.target.checked) this.selecionadas.add(id);
        else this.selecionadas.delete(id);
        return this.desenharAcoes();
      }
      this.socket()?.emit('mu-tocar', { id });
    });

    // o navegador barrou o som (autoplay): o primeiro toque na página destrava
    document.addEventListener('pointerdown', () => {
      if (this.tocando && this.player && this.estadoPlayer() !== 1) this.acompanhar();
    }, true);
    setInterval(() => this.tique(), 500);
  }

  // entrou (ou reconectou) na sala: pede a fila inteira
  iniciar() {
    this.socket()?.emit('mu-ver', (s) => { if (s) this.estado(s); });
  }

  estado(s) {
    if (s.fila) {
      this.fila = s.fila;
      const ids = new Set(s.fila.map((x) => x.id));
      for (const id of this.selecionadas) if (!ids.has(id)) this.selecionadas.delete(id);
    }
    this.idx = s.idx;
    this.tocando = s.tocando;
    this.tempo = s.tempo;
    this.recebido = performance.now();
    this.seq = s.seq;
    this.por = s.por;
    this.acompanhar();
    this.desenhar(!!s.fila);
  }

  aviso({ texto }) {
    if (texto) this.toast(texto, 'info', 4000, '#f472b6');
  }

  atual() {
    return this.fila[this.idx] ?? null;
  }

  // o segundo em que a sala está agora
  posicaoDaSala() {
    return this.tocando ? this.tempo + (performance.now() - this.recebido) / 1000 : this.tempo;
  }

  estadoPlayer() {
    try { return this.player?.getPlayerState?.() ?? -1; } catch { return -1; }
  }

  // o segundo que este navegador está tocando (o do player, quando ele já tem a faixa certa)
  agora() {
    const a = this.atual();
    if (a && this.carregado === `${this.seq}:${a.v}`) {
      try {
        const t = this.player.getCurrentTime();
        if (t > 0) return t;
      } catch { /* player sumiu */ }
    }
    return this.posicaoDaSala();
  }

  duracao() {
    const a = this.atual();
    if (!a || this.carregado !== `${this.seq}:${a.v}`) return 0;
    try { return this.player.getDuration() || 0; } catch { return 0; }
  }

  // põe o player no ponto da sala: faixa, tocando ou pausado, e o segundo
  async acompanhar() {
    const a = this.atual();
    if (!a) {
      this.carregado = null;
      try { this.player?.stopVideo(); } catch { /* nada tocando */ }
      return;
    }
    if (!this.player) {
      if (this.criando) return this.criando;
      this.criando = this.criarPlayer().finally(() => { this.criando = null; });
      await this.criando;
      return this.acompanhar();
    }
    const chave = `${this.seq}:${a.v}`;
    const p = this.player;
    try {
      if (this.carregado !== chave) {
        // faixa nova (ou a mesma de novo, numa fila de uma música só: o seq muda)
        this.carregado = chave;
        const inicio = Math.max(0, this.posicaoDaSala());
        if (this.tocando) p.loadVideoById({ videoId: a.v, startSeconds: inicio });
        else p.cueVideoById({ videoId: a.v, startSeconds: inicio });
        return;
      }
      const st = this.estadoPlayer();
      if (!this.tocando) {
        if (st === 1 || st === 3) p.pauseVideo();
        if (Math.abs(p.getCurrentTime() - this.tempo) > DESVIO) p.seekTo(this.tempo, true);
        return;
      }
      if (st === 0) return; // acabou aqui: o servidor já vai mandar a próxima
      if (Math.abs(p.getCurrentTime() - this.posicaoDaSala()) > DESVIO) p.seekTo(this.posicaoDaSala(), true);
      if (st !== 1 && st !== 3) p.playVideo();
    } catch { /* player ainda carregando */ }
  }

  async criarPlayer() {
    let YT;
    try { YT = await loadYouTubeApi(); } catch (err) {
      this.toast(err.message, 'error', 6000);
      return;
    }
    const el = document.createElement('div');
    $('#musica-sink').appendChild(el);
    await new Promise((resolve) => {
      const p = new YT.Player(el, {
        width: 200,
        height: 200,
        playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, iv_load_policy: 3, enablejsapi: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            p.getIframe().setAttribute('allow', 'autoplay; encrypted-media');
            p.setVolume(this.volume());
            this.player = p;
            resolve();
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.ENDED) this.socket()?.emit('mu-fim', { seq: this.seq });
            if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED) this.desenharAgora();
          },
          onError: (e) => {
            console.warn('[música] o YouTube não tocou a faixa:', e.data);
            this.socket()?.emit('mu-fim', { seq: this.seq, erro: true });
          },
        },
      });
    });
  }

  tique() {
    // conferência de vez em quando: player que travou no buffering ou ficou para trás volta ao ponto
    if (this.tocando && ++this.conta % 6 === 0) this.acompanhar();
    if (this.painelAberto()) this.desenharTempo();
    const dur = this.duracao();
    // o player chegou ao fim e a sala não andou (o YouTube nem sempre dispara o ENDED num player
    // escondido, ou o aviso se perdeu): avisa de novo. O servidor pula uma vez só (seq).
    const parado = this.estadoPlayer() === 0 || (dur && this.agora() >= dur - 0.5);
    if (this.tocando && dur && parado && performance.now() - (this.fimEm || 0) > 4000) {
      this.fimEm = performance.now();
      this.socket()?.emit('mu-fim', { seq: this.seq });
    }
    // rádio: a última da fila está acabando, o servidor põe uma parecida (do Mix do YouTube)
    if (this.tocando && dur && this.idx === this.fila.length - 1 && dur - this.agora() <= 30 && this.radioSeq !== this.seq) {
      this.radioSeq = this.seq;
      this.socket()?.emit('mu-radio', { seq: this.seq });
    }
  }

  async adicionar(texto, modo) {
    texto = String(texto || '').trim();
    if (!texto || this.ocupado) return;
    this.ocupado = true;
    this.mostrarErro(null);
    this.mostrarEscolha(null);
    const status = $('#mu-status-busca');
    status.textContent = /youtu|^https?:/i.test(texto) ? (modo === 'lista' ? 'Lendo a playlist…' : 'Buscando no YouTube…') : `Procurando ${texto}…`;
    status.hidden = false;
    $('#mu-add').disabled = true;
    const r = await new Promise((resolve) => {
      const s = this.socket();
      if (!s) return resolve({ erro: 'Sem conexão com a sala.' });
      s.timeout(25_000).emit('mu-adicionar', { texto, modo }, (err, res) => resolve(err ? { erro: 'O YouTube demorou demais. Tente de novo.' } : res));
    });
    this.ocupado = false;
    status.hidden = true;
    $('#mu-add').disabled = false;
    if (r?.escolher) return this.mostrarEscolha(texto);
    if (r?.erro) return this.mostrarErro(r.erro);
    if (r?.ok) {
      $('#mu-texto').value = '';
      const n = r.ok === 1 ? '1 música entrou' : `${r.ok} músicas entraram`;
      this.toast(r.busca ? `Tocando ${r.busca}: ${n} na fila` : `${n} na fila`, 'success', 3500);
    }
  }

  mostrarErro(msg) {
    const el = $('#mu-erro');
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  mostrarEscolha(texto) {
    this.escolha = texto;
    $('#mu-escolha').hidden = !texto;
  }

  // ------------------------------------------------------------------ desenho
  desenhar(comFila) {
    this.desenharAgora();
    if (comFila) this.desenharFila();
    else this.marcarTocando();
  }

  desenharAgora() {
    const a = this.atual();
    const img = $('#mu-capa');
    img.hidden = !a;
    if (a && img.dataset.v !== a.v) {
      img.dataset.v = a.v;
      img.src = capa(a.v);
    }
    $('#mu-capa-vazia').hidden = !!a;
    $('#mu-titulo').textContent = a ? a.t : 'Nenhuma música na fila';
    $('#mu-quando').textContent = !a ? 'Fila vazia' : this.tocando ? 'Tocando agora' : 'Pausado';
    $('#mu-quando').classList.toggle('pausado', !this.tocando);
    $('#mu-por').textContent = a ? `Pedida por ${a.por}${this.por && this.por !== a.por ? ` · última ação: ${this.por}` : ''}` : 'Cole um link ou digite um artista abaixo.';
    $('#mu-play').innerHTML = icon(this.tocando ? 'pause' : 'play', 22);
    for (const id of ['#mu-play', '#mu-ant', '#mu-prox', '#mu-telao']) $(id).disabled = !a;
    $('#mu-linha').hidden = !a;
    this.desenharTempo();
  }

  desenharTempo() {
    if (!this.atual()) return;
    const dur = this.duracao();
    const t = Math.min(this.agora(), dur || Infinity);
    $('#mu-fill').style.width = dur ? `${(t / dur) * 100}%` : '0';
    $('#mu-cur').textContent = mmss(t);
    $('#mu-dur').textContent = dur ? mmss(dur) : '--:--';
  }

  desenharFila() {
    const ul = $('#mu-fila');
    $('#mu-fila-titulo').textContent = `Fila (${this.fila.length})`;
    $('#mu-volta').hidden = !this.fila.length;
    ul.replaceChildren(...this.fila.map((x) => {
      const li = document.createElement('li');
      li.dataset.id = x.id;
      li.innerHTML = `<input type="checkbox" class="mu-marcar" aria-label="Selecionar música">
        <img src="${capa(x.v)}" alt="" loading="lazy">
        <span class="mu-item"><b></b><small></small></span>
        <button type="button" class="icon-btn mu-tirar" aria-label="Tirar da fila">${icon('lixo', 16)}</button>`;
      li.querySelector('b').textContent = x.t;
      li.querySelector('.mu-marcar').checked = this.selecionadas.has(x.id);
      return li;
    }));
    if (!this.fila.length) ul.innerHTML = '<li class="empty">Fila vazia. Ponha a primeira música aí em cima.</li>';
    this.marcarTocando();
    this.desenharAcoes();
  }

  // qual item da fila está tocando (muda sem a fila mudar)
  marcarTocando() {
    for (const li of document.querySelectorAll('#mu-fila li[data-id]')) {
      const x = this.fila.find((f) => f.id === Number(li.dataset.id));
      const atual = x === this.atual();
      li.classList.toggle('atual', atual);
      li.querySelector('small').textContent = atual ? (this.tocando ? '▶ Tocando' : '⏸ Pausado') : `por ${x?.por ?? ''}`;
    }
  }

  desenharAcoes() {
    const n = this.selecionadas.size;
    $('#mu-acoes').hidden = !this.fila.length;
    const todas = $('#mu-todas');
    todas.checked = n > 0 && n === this.fila.length;
    todas.indeterminate = n > 0 && n < this.fila.length;
    $('#mu-sel-rotulo').textContent = n ? `${n} selecionada${n > 1 ? 's' : ''}` : 'Selecionar todas';
    $('#mu-apagar-sel').hidden = !n;
    const tudo = $('#mu-apagar-tudo');
    if (!tudo.dataset.confirmar) tudo.innerHTML = `${icon('lixo', 14)}Apagar tudo`;
  }
}
