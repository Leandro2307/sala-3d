// Modo jogo: o relatório que diz onde somem os quadros. Quem compartilha mede a captura do jogo, o
// codificador e a saída da internet; quem joga mede a chegada, a decodificação e o que aparece na
// tela dele, e recebe o resumo do outro lado (controle-volta 'jogo-envio'). A cada 2 s sai uma
// linha "[modo-jogo]" no console e tudo fica guardado: o aviso tem o botão "Baixar relatório", e no
// console sala.relatorioJogo() copia o mesmo texto.

const BOM = 50; // abaixo disso (quadros por segundo) a jogatina já engasga
const SEGUIDAS = 3; // amostras ruins em seguida (6 s) antes de avisar
const ENTRE_AVISOS = 45_000;
const GUARDA = 900; // amostras guardadas (30 min a cada 2 s)

const kbps = (bytesPorSeg) => (bytesPorSeg == null ? null : Math.round((bytesPorSeg * 8) / 100) / 10);
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
// diferença por segundo entre duas leituras de uma soma
const porSeg = (agora, antes, campo, dt) => (antes && agora?.[campo] != null && antes[campo] != null && dt > 0 ? (agora[campo] - antes[campo]) / dt : null);
const dif = (agora, antes, campo) => (antes && agora?.[campo] != null && antes[campo] != null ? agora[campo] - antes[campo] : null);

const MOTIVOS = {
  captura: 'A captura do Chrome está pegando poucos quadros do jogo: a placa de vídeo de quem compartilha está no talo, ou o jogo está em tela cheia exclusiva. Limite o jogo a 60 qps, baixe um pouco a qualidade gráfica e use “janela sem bordas”.',
  cpu: 'O codificador de quem compartilha não dá conta (PC no limite).',
  software: 'O vídeo está sendo codificado no processador, não na placa de vídeo. No Chrome de quem compartilha: Configurações → Sistema → “Usar aceleração gráfica” ligado; no Windows, Configurações → Tela → Gráficos → Chrome em “Alto desempenho”. Em chrome://gpu, “Video Acceleration Information” diz se a placa codifica H.264. Tela cheia exclusiva também derruba para o processador: use janela sem bordas.',
  internet: 'A banda entre vocês está no limite e o navegador baixou a resolução para não travar. O Wi-Fi perde pacotes e cada perda derruba a banda: cabo no PC de quem compartilha e o celular perto do roteador (rede de 5 GHz) ajudam; pela internet, o ideal é 25 Mbps de upload livres.',
  codificador: 'O codificador está soltando menos quadros do que a captura entrega.',
  perdas: 'A internet entre vocês está perdendo pacotes: o vídeo trava esperando o que se perdeu.',
  tela: 'O vídeo chega inteiro, mas este PC não está dando conta de mostrar todos os quadros.',
  decod: 'Este PC não está dando conta de decodificar o vídeo.',
};

export class DiagJogo {
  constructor({ toast }) {
    this.toast = toast;
    this.sessao = null;
  }

  get ativo() { return !!this.sessao; }

  // lado: 'compartilha' (alguém joga no meu PC) ou 'joga' (eu jogo no PC de outra pessoa)
  comecar(lado, info = {}) {
    if (this.sessao?.lado === lado) return;
    if (this.sessao) this.parar(false);
    this.sessao = {
      lado,
      inicio: new Date().toISOString(),
      ambiente: { ...ambiente(info.gl), ...info.extra },
      eventos: [],
      amostras: [],
      antes: new Map(),
      ruins: 0,
      ultimoAviso: 0,
      outroLado: null,
      quemJoga: new Map(), // quem compartilha: o que cada pessoa que joga mediu do lado dela (doQuemJoga)
    };
    this.evento('começou', { lado, ...info.extra });
    if (info.video) this.contarQuadros(info.video);
  }

  // devolve o relatório da sessão que acabou (ou null) e oferece baixar
  parar(oferecer = true) {
    const s = this.sessao;
    if (!s) return null;
    this.evento('terminou');
    this.video = null;
    this.ultimo = this.relatorio();
    this.sessao = null;
    if (oferecer && s.amostras.length >= 2) {
      const m = mediaDe(s.amostras.map((a) => a.fpsFinal));
      const juntos = s.quemJoga.size ? ' (com o que o aparelho de quem jogou mediu)' : '';
      this.toast(`Modo jogo encerrado${m != null ? ` — média de ${Math.round(m)} qps` : ''}. O relatório ficou guardado${juntos}.`, 'info', 15000, null, { rotulo: 'Baixar relatório', fazer: () => this.baixar() });
    }
    return this.ultimo;
  }

  evento(texto, dados = null) {
    const e = { quando: new Date().toISOString(), texto, ...(dados ? { dados } : {}) };
    console.info('[modo-jogo]', texto, dados ?? '');
    this.sessao?.eventos.push(e);
    if (this.sessao && this.sessao.eventos.length > 300) this.sessao.eventos.shift();
  }

  // quadros que chegam de verdade na tela (o <video> chama a cada quadro mostrado)
  contarQuadros(video) {
    this.video = video;
    this.naTela = 0;
    if (!video?.requestVideoFrameCallback) return;
    const conta = () => {
      if (this.video !== video) return;
      this.naTela++;
      video.requestVideoFrameCallback(conta);
    };
    video.requestVideoFrameCallback(conta);
  }

  // ---------------------------------------------------------------- quem compartilha
  // cru: rtc.diagEnvio(key); quem: id de quem joga (o envio dela é o que importa). Devolve o resumo
  // que vai para quem joga.
  amostraEnvio(key, cru, quem, sala) {
    const s = this.sessao;
    if (!s || !cru) return null;
    const agora = performance.now();
    const env = cru.envios.find((e) => e.id === quem) || cru.envios[0];
    const chave = `envio:${key}:${env?.id}`;
    const antes = s.antes.get(chave);
    s.antes.set(chave, { t: agora, saida: env?.saida, captura: env?.captura });
    const dt = antes ? (agora - antes.t) / 1000 : 0;
    const o = env?.saida;
    const ob = antes?.saida;
    const lim = {};
    const durA = o?.qualityLimitationDurations;
    const durB = ob?.qualityLimitationDurations;
    if (durA && durB && dt > 0) for (const k of Object.keys(durA)) lim[k] = Math.round((100 * (durA[k] - (durB[k] || 0))) / dt);
    const cod = dif(o, ob, 'framesEncoded');
    const resumo = {
      t: Date.now(),
      captura: r1(env?.captura?.framesPerSecond ?? porSeg(env?.captura, antes?.captura, 'frames', dt)),
      capturaRes: env?.captura ? `${env.captura.width}x${env.captura.height}` : null,
      codificado: r1(porSeg(o, ob, 'framesEncoded', dt)),
      enviado: r1(porSeg(o, ob, 'framesSent', dt) ?? o?.framesPerSecond),
      altura: o?.frameHeight ?? null,
      largura: o?.frameWidth ?? null,
      kbps: kbps(porSeg(o, ob, 'bytesSent', dt)),
      alvoKbps: o?.targetBitrate != null ? Math.round(o.targetBitrate / 1000) : null,
      tetoKbps: env?.params?.maxBitrate != null ? Math.round(env.params.maxBitrate / 1000) : null,
      codMs: cod > 0 ? r1((1000 * dif(o, ob, 'totalEncodeTime')) / cod) : null,
      limite: o?.qualityLimitationReason ?? null,
      limitePct: lim,
      trocasDeResolucao: dif(o, ob, 'qualityLimitationResolutionChanges'),
      grandes: dif(o, ob, 'hugeFramesSent'),
      chaves: dif(o, ob, 'keyFramesEncoded'),
      nack: dif(o, ob, 'nackCount'),
      pli: dif(o, ob, 'pliCount'),
      reenviadosKbps: kbps(porSeg(o, ob, 'retransmittedBytesSent', dt)),
      // quanto cada pacote esperou na fila de envio (o ritmo da banda estimada): atraso a mais
      filaMs: dif(o, ob, 'packetsSent') > 0 ? r1((1000 * dif(o, ob, 'totalPacketSendDelay')) / dif(o, ob, 'packetsSent')) : null,
      bandaJogo: env?.bandaJogo ?? null,
      placa: o?.powerEfficientEncoder ?? null,
      codificador: o?.encoderImplementation ?? null,
      codec: env?.codec ?? null,
      perdaLa: env?.laLonge?.fractionLost != null ? r1(env.laLonge.fractionLost * 100) : null,
      rttMs: env?.rede?.rtt != null ? Math.round(env.rede.rtt * 1000) : null,
      saidaEstimadaKbps: env?.rede?.saidaEstimada != null ? Math.round(env.rede.saidaEstimada / 1000) : null,
      caminho: env?.rede?.local ?? null,
      degradacao: env?.params?.degradacao ?? null,
      nivel: env?.nivel ?? null,
      pessoas: cru.envios.length,
    };
    resumo.fpsFinal = resumo.enviado;
    // quem joga (nível máximo) devia receber a captura inteira: abaixo de 60% das linhas é migalha
    const capAltura = env?.captura?.height;
    resumo.imagemBaixa = resumo.nivel === 'max' && resumo.altura && capAltura ? resumo.altura < capAltura * 0.6 : null;
    resumo.motivo = motivoEnvio(resumo);
    s.amostras.push({ ...resumo, sala, trilha: s.amostras.length % 15 === 0 ? cru.trilha : undefined, cru: s.amostras.length % 15 === 0 ? cru : undefined });
    if (s.amostras.length > GUARDA) s.amostras.shift();
    console.log(`[modo-jogo] envio: captura ${resumo.captura} qps (${resumo.capturaRes}) → codificado ${resumo.codificado} → enviado ${resumo.enviado} qps · ${resumo.largura}x${resumo.altura} · ${resumo.kbps} kbps (alvo ${resumo.alvoKbps}, teto ${resumo.tetoKbps}) · ${resumo.codMs} ms/quadro · ${resumo.codificador}${resumo.placa ? ' (placa)' : ''} · limite ${resumo.limite} ${JSON.stringify(resumo.limitePct)} · rtt ${resumo.rttMs} ms · perda lá ${resumo.perdaLa}% · fila ${resumo.filaMs} ms · ${resumo.caminho}${resumo.imagemBaixa ? ' · IMAGEM BAIXA' : ''}${resumo.motivo ? ` · MOTIVO: ${resumo.motivo}` : ''}`, { resumo, sala });
    this.julgar(resumo, 'compartilha');
    return resumo;
  }

  // ---------------------------------------------------------------- quem joga
  amostraRecebe(cru, sala) {
    const s = this.sessao;
    if (!s || !cru) return null;
    const agora = performance.now();
    const antes = s.antes.get('recebe');
    const q = this.video?.getVideoPlaybackQuality?.();
    s.antes.set('recebe', { t: agora, entrada: cru.entrada, naTela: this.naTela, q });
    const dt = antes ? (agora - antes.t) / 1000 : 0;
    const i = cru.entrada;
    const ib = antes?.entrada;
    const emitidos = dif(i, ib, 'jitterBufferEmittedCount');
    const dec = dif(i, ib, 'framesDecoded');
    const la = s.outroLado && Date.now() - s.outroLado.recebido < 6000 ? s.outroLado : null;
    const resumo = {
      t: Date.now(),
      recebido: r1(porSeg(i, ib, 'framesReceived', dt)),
      decodificado: r1(porSeg(i, ib, 'framesDecoded', dt)),
      naTela: dt > 0 && this.video?.requestVideoFrameCallback ? r1((this.naTela - antes.naTela) / dt) : null,
      descartados: dif(i, ib, 'framesDropped'),
      descartadosNaTela: q && antes?.q ? q.droppedVideoFrames - antes.q.droppedVideoFrames : null,
      altura: i?.frameHeight ?? null,
      largura: i?.frameWidth ?? null,
      kbps: kbps(porSeg(i, ib, 'bytesReceived', dt)),
      congelou: dif(i, ib, 'freezeCount'),
      congeladoMs: i?.totalFreezesDuration != null && ib ? Math.round((i.totalFreezesDuration - (ib.totalFreezesDuration || 0)) * 1000) : null,
      decMs: dec > 0 ? r1((1000 * dif(i, ib, 'totalDecodeTime')) / dec) : null,
      bufferMs: emitidos > 0 ? r1((1000 * dif(i, ib, 'jitterBufferDelay')) / emitidos) : null,
      bufferAlvoMs: emitidos > 0 && i?.jitterBufferTargetDelay != null ? r1((1000 * dif(i, ib, 'jitterBufferTargetDelay')) / emitidos) : null,
      perdidos: dif(i, ib, 'packetsLost'),
      nack: dif(i, ib, 'nackCount'),
      pli: dif(i, ib, 'pliCount'),
      decodificador: i?.decoderImplementation ?? null,
      placa: i?.powerEfficientDecoder ?? null,
      codec: cru.codec ?? null,
      rttMs: cru.rede?.rtt != null ? Math.round(cru.rede.rtt * 1000) : null,
      entradaEstimadaKbps: cru.rede?.entradaEstimada != null ? Math.round(cru.rede.entradaEstimada / 1000) : null,
      caminho: cru.rede?.local ?? null,
      jitterBufferTarget: cru.jitterBufferTarget,
      playoutDelayHint: cru.playoutDelayHint,
      la: la ? { captura: la.captura, enviado: la.enviado, altura: la.altura, kbps: la.kbps, limite: la.limite, motivo: la.motivo, codificador: la.codificador, placa: la.placa, imagemBaixa: la.imagemBaixa ?? null } : null,
    };
    resumo.fpsFinal = resumo.naTela ?? resumo.decodificado;
    resumo.imagemBaixa = la?.imagemBaixa ?? null;
    resumo.motivo = motivoRecebe(resumo, la);
    s.amostras.push({ ...resumo, sala, cru: s.amostras.length % 15 === 0 ? cru : undefined });
    if (s.amostras.length > GUARDA) s.amostras.shift();
    console.log(`[modo-jogo] chegada: recebido ${resumo.recebido} → decodificado ${resumo.decodificado} → na tela ${resumo.naTela} qps · ${resumo.largura}x${resumo.altura} · ${resumo.kbps} kbps · decodifica ${resumo.decMs} ms (${resumo.decodificador}${resumo.placa ? ', placa' : ''}) · buffer ${resumo.bufferMs} ms · perdidos ${resumo.perdidos} · congelou ${resumo.congelou} (${resumo.congeladoMs} ms) · rtt ${resumo.rttMs} ms · ${resumo.caminho}${la ? ` · lá: captura ${la.captura}, enviado ${la.enviado}, limite ${la.limite}` : ' · sem notícia de lá'}${resumo.motivo ? ` · MOTIVO: ${resumo.motivo}` : ''}`, { resumo, sala });
    this.julgar(resumo, 'joga');
    return resumo;
  }

  // o resumo que quem compartilha manda a cada 2 s
  doOutroLado(resumo) {
    if (!this.sessao || !resumo) return;
    this.sessao.outroLado = { ...resumo, recebido: Date.now() };
  }

  // Quem compartilha: a amostra que quem joga mediu do lado dela (chegada, decodificação, tela),
  // pelo canal direto a cada 2 s. Vai junto no relatório deste PC: o do celular não precisa ser
  // baixado no celular. amb: o ambiente dela (de vez em quando).
  doQuemJoga(id, nome, { r, amb } = {}) {
    const s = this.sessao;
    if (s?.lado !== 'compartilha' || !r || typeof r !== 'object') return;
    let q = s.quemJoga.get(id);
    if (!q) s.quemJoga.set(id, (q = { nome, ambiente: null, amostras: [] }));
    if (amb && typeof amb === 'object') q.ambiente = amb;
    q.amostras.push({ ...r, chegou: Date.now() });
    if (q.amostras.length > GUARDA) q.amostras.shift();
  }

  // várias amostras ruins em seguida (poucos quadros ou a imagem em migalhas): avisa (com o
  // porquê) de vez em quando
  julgar(r, lado) {
    const s = this.sessao;
    const { fpsFinal: fps, motivo, imagemBaixa } = r;
    if (fps == null) return;
    if (fps >= BOM && !imagemBaixa) {
      s.ruins = 0;
      return;
    }
    if (++s.ruins < SEGUIDAS || Date.now() - s.ultimoAviso < ENTRE_AVISOS) return;
    s.ultimoAviso = Date.now();
    const texto = MOTIVOS[motivo] || 'O motivo não ficou claro pelos números.';
    const onde = lado === 'joga' && ['captura', 'cpu', 'software', 'internet', 'codificador'].includes(motivo) ? 'No PC de quem compartilha: ' : '';
    const altura = lado === 'joga' ? r.la?.altura ?? r.altura : r.altura;
    const como = fps >= BOM ? `com a imagem baixa${altura ? ` (${altura} linhas)` : ''}` : `a ${Math.round(fps)} qps${imagemBaixa && altura ? `, ${altura} linhas` : ''}`;
    this.evento('aviso', { fps, motivo, imagemBaixa, altura });
    this.toast(`Modo jogo ${como}. ${onde}${texto}`, 'warn', 15000, null, { rotulo: 'Baixar relatório', fazer: () => this.baixar() });
  }

  // ---------------------------------------------------------------- relatório
  relatorio() {
    const s = this.sessao;
    if (!s) return this.ultimo || null;
    return {
      versao: 2,
      lado: s.lado,
      inicio: s.inicio,
      fim: new Date().toISOString(),
      resumo: resumoDe(s.amostras),
      ambiente: s.ambiente,
      eventos: s.eventos,
      amostras: s.amostras,
      // o lado de quem joga, medido lá (só no relatório de quem compartilha)
      quemJoga: [...s.quemJoga].map(([id, q]) => ({ id, nome: q.nome, resumo: resumoDe(q.amostras), ambiente: q.ambiente, amostras: q.amostras })),
    };
  }

  texto() {
    return JSON.stringify(this.relatorio(), null, 1);
  }

  baixar() {
    const r = this.relatorio();
    if (!r) return;
    const nome = `modo-jogo-${r.lado}-${r.inicio.slice(0, 16).replace(/[T:]/g, '-')}.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async copiar() {
    const t = this.texto();
    try {
      await navigator.clipboard.writeText(t);
      console.info('[modo-jogo] relatório copiado:', t.length, 'caracteres');
    } catch (err) {
      console.warn('[modo-jogo] não deu para copiar (clique na página antes); baixando o arquivo', err);
      this.baixar();
    }
    return this.relatorio();
  }
}

// A imagem em migalhas por falta de banda vem antes da captura: num relatório a captura estava em
// 32 qps e a tela saía em 345×210 por banda, e o motivo dizia só "captura".
function motivoEnvio(r) {
  const lim = r.limitePct || {};
  const banda = (lim.bandwidth || 0) > 30 || r.limite === 'bandwidth';
  const cpu = (lim.cpu || 0) > 30 || r.limite === 'cpu';
  if (r.imagemBaixa) return banda ? 'internet' : cpu ? 'cpu' : 'internet';
  if (r.enviado == null || r.enviado >= BOM) return null;
  if (r.captura != null && r.captura < BOM) return 'captura';
  if (r.placa === false && /openh264|libvpx|libaom|dav1d|software/i.test(r.codificador || '')) return 'software';
  if (cpu) return 'cpu';
  if (banda) return 'internet';
  return 'codificador';
}

function motivoRecebe(r, la) {
  if (la?.imagemBaixa) return la.motivo || 'internet';
  const fps = r.naTela ?? r.decodificado;
  if (fps == null || fps >= BOM) return null;
  if (la?.enviado != null && la.enviado < BOM) return la.motivo || 'codificador';
  if ((r.perdidos || 0) > 0 || (r.congelou || 0) > 0) return 'perdas';
  if (r.decodificado != null && r.decodificado < BOM && (r.recebido ?? 0) >= BOM) return 'decod';
  if (r.naTela != null && r.naTela < BOM && (r.decodificado ?? 0) >= BOM) return 'tela';
  return la ? 'perdas' : null;
}

function resumoDe(amostras) {
  const fps = amostras.map((a) => a.fpsFinal).filter((v) => v != null);
  const motivos = {};
  for (const a of amostras) if (a.motivo) motivos[a.motivo] = (motivos[a.motivo] || 0) + 1;
  return {
    amostras: fps.length,
    mediaQps: r1(mediaDe(fps)),
    piorQps: fps.length ? Math.min(...fps) : null,
    abaixoDe50: fps.filter((v) => v < BOM).length,
    imagemBaixa: amostras.filter((a) => a.imagemBaixa).length,
    motivos,
  };
}

function mediaDe(v) {
  const n = v.filter((x) => x != null);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}

// o PC e o navegador (vai no topo do relatório)
function ambiente(gl) {
  let gpu = null;
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
  } catch { /* contexto perdido */ }
  const c = navigator.connection;
  return {
    navegador: navigator.userAgent,
    nucleos: navigator.hardwareConcurrency ?? null,
    memoriaGb: navigator.deviceMemory ?? null,
    tela: `${screen.width}x${screen.height} @${devicePixelRatio}`,
    janela: `${innerWidth}x${innerHeight}`,
    gpu,
    rede: c ? { tipo: c.effectiveType, downlinkMbps: c.downlink, rttMs: c.rtt, economia: c.saveData } : null,
  };
}
