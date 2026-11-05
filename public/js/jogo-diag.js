// Modo jogo: o relatório que diz onde somem os quadros. Quem compartilha mede a captura do jogo, o
// codificador e a saída da internet; quem joga mede a chegada, a decodificação e o que aparece na
// tela dele, e recebe o resumo do outro lado (controle-volta 'jogo-envio'). A cada 2 s sai uma
// linha "[modo-jogo]" no console e tudo fica guardado: o aviso tem o botão "Baixar relatório", e no
// console sala.relatorioJogo() copia o mesmo texto.
// O relatório também vai sozinho para o servidor (POST /relatorio-jogo): a cada minuto, ao terminar
// e ao fechar a aba. Assim não precisa baixar e mandar, e uma página que caiu não leva tudo junto.
// Para ler: npm run relatorios (scripts/relatorios.js).

import { Ritmo } from './ritmo.js';

const BOM = 50; // abaixo disso (quadros por segundo) a jogatina já engasga
const SEGUIDAS = 3; // amostras ruins em seguida (6 s) antes de avisar
const ENTRE_AVISOS = 45_000;
const GUARDA = 900; // amostras guardadas (30 min a cada 2 s)
const ENVIO_MS = 60_000; // de quanto em quanto tempo o relatório da sessão vai para o servidor
const PS5 = /chiaki|\bps5\b|playstation/i; // a janela do Remote Play do PS5 (o mesmo título de toque-jogo.js)

const kbps = (bytesPorSeg) => (bytesPorSeg == null ? null : Math.round((bytesPorSeg * 8) / 100) / 10);
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
// diferença por segundo entre duas leituras de uma soma
const porSeg = (agora, antes, campo, dt) => (antes && agora?.[campo] != null && antes[campo] != null && dt > 0 ? (agora[campo] - antes[campo]) / dt : null);
const dif = (agora, antes, campo) => (antes && agora?.[campo] != null && antes[campo] != null ? agora[campo] - antes[campo] : null);

const MOTIVOS = {
  captura: 'A captura do Chrome está pegando poucos quadros do jogo: a placa de vídeo de quem compartilha está no talo, ou o jogo está em tela cheia exclusiva. Limite o jogo a 60 qps, baixe um pouco a qualidade gráfica e use “janela sem bordas”.',
  // Presa perto de 30. O preset sozinho não faz isso (medido: Leve, Máxima e Ultra dão os mesmos
  // ~55 qps numa janela), e num relatório a captura em 720p subiu de 21 para 32: a placa no limite
  // (jogo + codificação + captura disputando). Ou o jogo sem foco (limite de quadros em segundo plano).
  fundo: 'A captura está presa perto de 30 qps no PC de quem compartilha: a placa de vídeo deve estar no limite, ou o jogo sem foco. Limite o jogo a 60 qps (sem quadros sobrando a captura volta a ~55), baixe um pouco os gráficos ou use o preset Leve; no Painel de Controle da NVIDIA, desative “Taxa máxima de quadros do aplicativo em segundo plano”.',
  cpu: 'O codificador de quem compartilha não dá conta (PC no limite).',
  software: 'O vídeo está sendo codificado no processador, não na placa de vídeo. No Chrome de quem compartilha: Configurações → Sistema → “Usar aceleração gráfica” ligado; no Windows, Configurações → Tela → Gráficos → Chrome em “Alto desempenho”. Em chrome://gpu, “Video Acceleration Information” diz se a placa codifica H.264. Tela cheia exclusiva também derruba para o processador: use janela sem bordas.',
  internet: 'A banda entre vocês está no limite e o navegador baixou a resolução para não travar. O Wi-Fi perde pacotes e cada perda derruba a banda: cabo no PC de quem compartilha e o celular perto do roteador (rede de 5 GHz) ajudam; pela internet, o ideal é 25 Mbps de upload livres.',
  codificador: 'O codificador está soltando menos quadros do que a captura entrega.',
  // PS5 pelo chiaki-ng com a captura caindo aos trancos (não presa em 30): a origem é o próprio Remote
  // Play. No relatório de 2026-11-03 16:13 ela ia de 57 a 30 e voltava em 2–6 s, e o aviso falava do
  // limite de segundo plano da NVIDIA.
  ps5: 'O chiaki-ng está mostrando menos de 60 quadros: o jogo no PS5 pode estar abaixo de 60 nessa parte (modo qualidade, cena pesada ou parada) ou a conexão entre o PS5 e o PC está perdendo. PS5 e PC no cabo ajudam; no chiaki-ng, confira se o vídeo está em 60 qps e, no jogo, prefira o modo desempenho.',
  // modo turbo: a captura veio inteira, mas a fila de envio encheu e os quadros foram pulados lá
  fila: 'A internet entre vocês não está dando vazão: o PC de quem compartilha pula quadros para a imagem não atrasar. Cabo de rede no PC de quem compartilha (e no PS5) e o aparelho de quem joga no Wi-Fi de 5 GHz, perto do roteador, ajudam.',
  perdas: 'A internet entre vocês está perdendo pacotes: o vídeo trava esperando o que se perdeu.',
  tela: 'O vídeo chega e é decodificado inteiro, mas o aparelho mostra menos quadros. No iPhone, o Modo de Pouca Energia limita o Safari a 30 qps: desligue em Ajustes → Bateria (e deixe o celular carregando, se esquentar). No PC, feche o que pesa na placa, e no notebook na bateria a Economia de energia do Chrome também limita a 30 qps (chrome://settings/performance).',
  decod: 'Este PC não está dando conta de decodificar o vídeo.',
  // modo turbo: a viagem medida (fila de envio + rede) passou de 25 ms com a imagem fluindo
  wifi: 'A imagem chega inteira, mas demora no caminho entre vocês (fila e rede). O que mais tira atraso: cabo de rede no PC de quem compartilha (e no PS5) e o celular no Wi-Fi de 5 GHz, perto do roteador.',
};

export class DiagJogo {
  // contexto(): { sala, nome } de quem está medindo, para achar o relatório no servidor
  constructor({ toast, contexto = () => ({}) }) {
    this.toast = toast;
    this.contexto = contexto;
    this.sessao = null;
    // aba fechando ou indo para o fundo (celular): manda o que tem
    addEventListener('pagehide', () => this.enviar(true));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.enviar(true); });
  }

  get ativo() { return !!this.sessao; }

  // lado: 'compartilha' (alguém joga no meu PC) ou 'joga' (eu jogo no PC de outra pessoa)
  comecar(lado, info = {}) {
    if (this.sessao?.lado === lado) return;
    if (this.sessao) this.parar(false);
    this.sessao = {
      lado,
      id: idNovo(),
      inicio: new Date().toISOString(),
      ambiente: { ...ambiente(info.gl), ...info.extra },
      eventos: [],
      amostras: [],
      antes: new Map(),
      ruins: 0,
      ultimoAviso: 0,
      outroLado: null,
      quemJoga: new Map(), // quem compartilha: o que cada pessoa que joga mediu do lado dela (doQuemJoga)
      engasgos: [], // quem joga: as vezes que marcou "engasgou" desde a última amostra (marcarEngasgo)
      totalEngasgos: 0,
    };
    this.evento('começou', { lado, ...info.extra });
    clearInterval(this.timerEnvio);
    this.timerEnvio = setInterval(() => this.enviar(), ENVIO_MS);
    if (info.video) this.contarQuadros(info.video);
  }

  // devolve o relatório da sessão que acabou (ou null) e oferece baixar
  parar(oferecer = true) {
    const s = this.sessao;
    if (!s) return null;
    this.evento('terminou');
    this.video = null;
    clearInterval(this.timerEnvio);
    this.enviar();
    this.ultimo = this.relatorio();
    this.sessao = null;
    if (oferecer && s.amostras.length >= 2) {
      const m = mediaDe(s.amostras.map((a) => a.fpsFinal));
      const juntos = s.quemJoga.size ? ' (com o que o aparelho de quem jogou mediu)' : '';
      this.toast(`Modo jogo encerrado${m != null ? ` — média de ${Math.round(m)} qps` : ''}. O relatório foi salvo no servidor${juntos}.`, 'info', 15000, null, { rotulo: 'Baixar relatório', fazer: () => this.baixar() });
    }
    return this.ultimo;
  }

  evento(texto, dados = null) {
    const e = { quando: new Date().toISOString(), texto, ...(dados ? { dados } : {}) };
    console.info('[modo-jogo]', texto, dados ?? '');
    this.sessao?.eventos.push(e);
    if (this.sessao && this.sessao.eventos.length > 300) this.sessao.eventos.shift();
  }

  // Quadros que chegam de verdade na tela (o <video> chama a cada quadro mostrado) e o ritmo deles
  // (ritmo.js): cada um marcado na volta da tela em que vai aparecer. No turbo o <video> fica parado e
  // quem mede é o turbo.js.
  contarQuadros(video) {
    this.video = video;
    this.naTela = 0;
    this.ritmoVideo = new Ritmo();
    if (!video?.requestVideoFrameCallback) return;
    const ritmo = this.ritmoVideo;
    const conta = (agora, meta) => {
      if (this.video !== video) return;
      this.naTela++;
      ritmo.marcar(meta?.expectedDisplayTime ?? agora);
      video.requestVideoFrameCallback(conta);
    };
    video.requestVideoFrameCallback(conta);
    const volta = (t) => {
      if (this.video !== video) return;
      ritmo.volta(t);
      requestAnimationFrame(volta);
    };
    requestAnimationFrame(volta);
  }

  // Quem joga tocou em "Engasgou": marca a hora (vai na próxima amostra, que segue também para quem
  // compartilha) e guarda no relatório a caixa-preta do turbo (os últimos 3 s, quadro a quadro).
  marcarEngasgo(caixaPreta = null) {
    const s = this.sessao;
    if (!s) return false;
    const quando = new Date().toISOString();
    s.engasgos.push(quando);
    s.totalEngasgos++;
    const a = s.amostras.at(-1);
    this.evento('engasgou (marcado por quem joga)', {
      quando,
      ultimaAmostra: a ? { modo: a.modo || 'video', fpsFinal: a.fpsFinal, atrasoMs: a.atrasoMs, ritmo: a.ritmo ?? null, motivo: a.motivo } : null,
      caixaPreta,
    });
    return true;
  }

  // ---------------------------------------------------------------- quem compartilha
  // cru: rtc.diagEnvio(key); quem: id de quem joga (o envio dela é o que importa). Devolve o resumo
  // que vai para quem joga.
  // janela: o título da janela compartilhada (o PS5 pelo chiaki-ng tem aviso próprio)
  amostraEnvio(key, cru, quem, sala, turbo = null, janela = null) {
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
      // quantos codificadores desta tela estão trabalhando (um por pessoa que recebe, na malha): quem
      // assiste ao jogo de perto custava quadros a quem joga
      codificadores: cru.envios.filter((e) => e.params?.active !== false && (e.saida?.framesPerSecond ?? 0) > 0).length,
      // o Wi-Fi deste PC (o ajudante do Windows lê: sinal, faixa, canal, velocidade); null sem ajudante
      wifi: this.wifi && Date.now() - this.wifi.em < 30_000 ? this.wifi.info : null,
    };
    resumo.fpsFinal = resumo.enviado;
    // modo turbo: a imagem dessa pessoa vai pelo canal turbo e o vídeo da conexão está parado de
    // propósito — os números que valem são os do turbo (turbo.js, TurboEnvio.stats)
    if (turbo) {
      // o codificador e a placa que aparecem aqui são os do vídeo da conexão, parado para essa pessoa
      // (um relatório mostrava "D3D12VideoEncodeAccelerator" e o motivo "codificador" por eles)
      Object.assign(resumo, { modo: 'turbo', turbo, enviado: turbo.qps, fpsFinal: turbo.qps, kbps: turbo.kbps, largura: turbo.largura, altura: turbo.altura, codificador: null, placa: null });
      if (turbo.codMs != null) resumo.codMs = turbo.codMs;
    }
    // quem joga (nível máximo) devia receber a captura inteira: abaixo de 60% das linhas é migalha
    const capAltura = env?.captura?.height;
    resumo.imagemBaixa = resumo.nivel === 'max' && resumo.altura && capAltura ? resumo.altura < capAltura * 0.6 : null;
    // as últimas capturas desta tela: "presa perto de 30" é de várias amostras, não de uma
    s.capturas ??= new Map();
    const caps = [...(s.capturas.get(chave) || []), resumo.captura].slice(-SEGUIDAS);
    s.capturas.set(chave, caps);
    resumo.motivo = motivoEnvio(resumo, { capturas: caps, ps5: PS5.test(janela || '') });
    // a placa recusou (medida ímpar, por exemplo) e o Chrome passou para o processador, ou voltou
    const ant = s.amostras.at(-1)?.codificador;
    if (ant && resumo.codificador && ant !== resumo.codificador) this.evento('codificador trocou', { de: ant, para: resumo.codificador, enviado: `${resumo.largura}x${resumo.altura}`, captura: resumo.capturaRes });
    s.amostras.push({ ...resumo, sala, trilha: s.amostras.length % 15 === 0 ? cru.trilha : undefined, cru: s.amostras.length % 15 === 0 ? cru : undefined });
    if (s.amostras.length > GUARDA) s.amostras.shift();
    console.log(`[modo-jogo] envio: captura ${resumo.captura} qps (${resumo.capturaRes}) → codificado ${resumo.codificado} → enviado ${resumo.enviado} qps · ${resumo.largura}x${resumo.altura} · ${resumo.kbps} kbps (alvo ${resumo.alvoKbps}, teto ${resumo.tetoKbps}) · ${resumo.codMs} ms/quadro · ${resumo.codificador}${resumo.placa ? ' (placa)' : ''} · limite ${resumo.limite} ${JSON.stringify(resumo.limitePct)} · rtt ${resumo.rttMs} ms · perda lá ${resumo.perdaLa}% · fila ${resumo.filaMs} ms · ${resumo.caminho}${resumo.imagemBaixa ? ' · IMAGEM BAIXA' : ''}${resumo.motivo ? ` · MOTIVO: ${resumo.motivo}` : ''}`, { resumo, sala });
    this.julgar(resumo, 'compartilha');
    return resumo;
  }

  // ---------------------------------------------------------------- quem joga
  // extra: o que o main.js mediu do controle (ping, tempo até o ajudante, movimento cru...)
  amostraRecebe(cru, sala, extra = {}) {
    const s = this.sessao;
    if (!s || !cru) return null;
    const agora = performance.now();
    const antes = s.antes.get('recebe');
    const q = this.video?.getVideoPlaybackQuality?.();
    s.antes.set('recebe', { t: agora, entrada: cru.entrada, naTela: this.naTela, q, som: cru.som });
    const somEmitidos = dif(cru.som, antes?.som, 'jitterBufferEmittedCount');
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
      la: la ? { captura: la.captura, enviado: la.enviado, altura: la.altura, kbps: la.kbps, limite: la.limite, motivo: la.motivo, codificador: la.codificador, placa: la.placa, imagemBaixa: la.imagemBaixa ?? null, codMs: la.codMs ?? null, filaMs: la.filaMs ?? null, turbo: la.turbo ?? null } : null,
      // o som da mesma tela: buffer maior que o do vídeo faz o vídeo esperar por ele (sincronia)
      somBufferMs: somEmitidos > 0 ? r1((1000 * dif(cru.som, antes?.som, 'jitterBufferDelay')) / somEmitidos) : null,
      bufferMinimoMs: emitidos > 0 && i?.jitterBufferMinimumDelay != null ? r1((1000 * dif(i, ib, 'jitterBufferMinimumDelay')) / emitidos) : null,
      ...extra,
    };
    // o ritmo na tela: o do turbo quando ele desenha; senão o do <video>. A conta do <video> zera
    // sempre (senão juntaria o que veio antes do turbo).
    const ritmoVideo = this.ritmoVideo?.stats() ?? null;
    if (resumo.turbo?.ritmo !== undefined) {
      resumo.ritmo = resumo.turbo.ritmo;
      delete resumo.turbo.ritmo;
    } else resumo.ritmo = ritmoVideo;
    if (s.engasgos.length) {
      resumo.engasgos = s.engasgos;
      s.engasgos = [];
    }
    // Do dedo ao olho, estimado: o comando vai (metade do ping, mais o caminho até o ajudante), o jogo
    // desenha (um quadro a 60), a captura e o codificador lá, a imagem volta (metade da ida e volta),
    // espera no buffer, decodifica e espera a vez na tela (meio quadro)
    if (resumo.controleRttMs != null && resumo.rttMs != null) {
      resumo.atrasoMs = Math.round(resumo.controleRttMs / 2 + (resumo.ajudanteMs ?? 2) / 2 + 16.7 + 8 + (la?.codMs ?? 8) + (la?.filaMs ?? 0)
        + resumo.rttMs / 2 + (resumo.bufferMs ?? 0) + (resumo.decMs ?? 0) + 8);
    }
    resumo.fpsFinal = resumo.naTela ?? resumo.decodificado;
    resumo.imagemBaixa = la?.imagemBaixa ?? null;
    resumo.motivo = motivoRecebe(resumo, la);
    // modo turbo (turbo.js): a imagem chega pelo canal turbo e é desenhada sem buffer; o vídeo da
    // conexão está parado. Atraso do dedo ao olho: o comando vai, o jogo desenha, a captura, e daí
    // até desenhado aqui — medido quadro a quadro (pontaMs: codificação, fila de envio, rede, montagem
    // e decodificação, com os relógios acertados) ou, com quem compartilha numa versão antiga, somado
    // das partes com a viagem estimada em metade da ida e volta (que não via a fila) — e meio quadro
    // esperando a tela.
    const tb = resumo.turbo;
    if (tb) {
      Object.assign(resumo, { modo: 'turbo', fpsFinal: tb.qps, kbps: tb.kbps, largura: tb.largura, altura: tb.altura });
      if (resumo.controleRttMs != null && (tb.pontaMs != null || tb.redeMs != null)) {
        const imagem = tb.pontaMs ?? (tb.codMs ?? la?.codMs ?? 8) + tb.redeMs + (tb.montagemMs ?? 0) + (tb.decMs ?? 0);
        // a ida do comando medida com os relógios acertados (controleIdaMs, main.js); metade da ida e
        // volta só sem ela: a volta do ping espera atrás da imagem no mesmo caminho, e nos picos do
        // Wi-Fi dava 107–254 ms de ida e volta com o comando indo pelo outro sentido
        const ida = resumo.controleIdaMs ?? resumo.controleRttMs / 2;
        resumo.atrasoMs = Math.round(ida + (resumo.ajudanteMs ?? 2) / 2 + 16.7 + 8 + imagem + 8);
        resumo.atrasoMedido = tb.pontaMs != null;
      }
      // a captura lá abaixo de 60: o motivo de lá; com ela inteira, as perdas no caminho ou o que lá
      // viu (a fila de envio cheia)
      resumo.motivo = tb.qps >= BOM ? null
        : la?.captura != null && la.captura < BOM ? la.motivo || 'captura'
          : tb.perdidos > 0 ? 'perdas'
            : la?.motivo === 'fila' ? 'fila' : 'perdas';
      // imagem boa, mas esperando na fila/rede mais que um quadro e meio: o Wi-Fi é o atraso
      if (!resumo.motivo && tb.viagemMs != null && tb.viagemMs > 25) resumo.motivo = 'wifi';
    }
    s.amostras.push({ ...resumo, sala, cru: s.amostras.length % 15 === 0 ? cru : undefined });
    if (s.amostras.length > GUARDA) s.amostras.shift();
    console.log(`[modo-jogo] chegada: recebido ${resumo.recebido} → decodificado ${resumo.decodificado} → na tela ${resumo.naTela} qps · ${resumo.largura}x${resumo.altura} · ${resumo.kbps} kbps · decodifica ${resumo.decMs} ms (${resumo.decodificador}${resumo.placa ? ', placa' : ''}) · buffer ${resumo.bufferMs} ms (som ${resumo.somBufferMs} ms) · controle ${resumo.controleRttMs} ms · atraso total ~${resumo.atrasoMs} ms · perdidos ${resumo.perdidos} · congelou ${resumo.congelou} (${resumo.congeladoMs} ms) · rtt ${resumo.rttMs} ms · ${resumo.caminho}${la ? ` · lá: captura ${la.captura}, enviado ${la.enviado}, limite ${la.limite}` : ' · sem notícia de lá'}${resumo.motivo ? ` · MOTIVO: ${resumo.motivo}` : ''}`, { resumo, sala });
    this.julgar(resumo, 'joga');
    return resumo;
  }

  // o Wi-Fi deste PC, lido pelo ajudante do Windows (main.js: controle.onWifi); vai em cada amostra de envio
  wifiChegou(info) {
    this.wifi = { info, em: Date.now() };
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
    if (Array.isArray(r.engasgos) && r.engasgos.length) this.evento('quem joga marcou engasgo', { nome, quando: r.engasgos.slice(0, 10) });
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
    // turbo com a imagem fluindo, mas demorando no caminho (motivo 'wifi'): a dica sai uma vez por sessão
    s.lentas = motivo === 'wifi' ? (s.lentas || 0) + 1 : 0;
    if (s.lentas >= SEGUIDAS && !s.avisouWifi) {
      s.avisouWifi = true;
      this.evento('aviso', { motivo, viagemMs: r.turbo?.viagemMs ?? null });
      this.toast(`Modo turbo: ${MOTIVOS.wifi}`, 'info', 12000);
    }
    if (fps >= BOM && !imagemBaixa) {
      s.ruins = 0;
      return;
    }
    if (++s.ruins < SEGUIDAS || Date.now() - s.ultimoAviso < ENTRE_AVISOS) return;
    s.ultimoAviso = Date.now();
    const texto = MOTIVOS[motivo] || 'O motivo não ficou claro pelos números.';
    const onde = lado === 'joga' && ['captura', 'fundo', 'ps5', 'cpu', 'software', 'internet', 'codificador'].includes(motivo) ? 'No PC de quem compartilha: ' : '';
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

  // Manda o relatório da sessão para o servidor (o mesmo id substitui o anterior lá). O texto é
  // montado na hora (síncrono), então vale também para a sessão que está terminando.
  // saindo: a aba está fechando — vai com keepalive, que só passa até 64 kB (pode não ir; o envio
  // de cada minuto já guardou quase tudo).
  enviar(saindo = false) {
    const s = this.sessao;
    if (!s || s.amostras.length < 2) return;
    const agora = Date.now();
    if (saindo && agora - (s.enviadoEm || 0) < 5000) return;
    s.enviadoEm = agora;
    const { sala = null, nome = null } = this.contexto() || {};
    const texto = JSON.stringify({ id: s.id, sala, nome, relatorio: this.relatorio() });
    (async () => {
      const gz = await gzip(texto);
      const corpo = gz || texto;
      const r = await fetch('/relatorio-jogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(gz ? { 'Content-Encoding': 'gzip' } : {}) },
        body: corpo,
        keepalive: saindo && (gz ? gz.size : texto.length) < 60_000,
      });
      if (!r.ok) console.warn('[modo-jogo] o servidor não guardou o relatório:', r.status);
    })().catch((err) => {
      if (!saindo) console.warn('[modo-jogo] não deu para mandar o relatório ao servidor', err);
    });
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

const idNovo = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

// gzip pelo navegador (o relatório de 30 min passa de 1 MB em texto); sem CompressionStream, vai cru
async function gzip(texto) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    return await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  } catch {
    return null;
  }
}

// A imagem em migalhas por falta de banda vem antes da captura: num relatório a captura estava em
// 32 qps e a tela saía em 345×210 por banda, e o motivo dizia só "captura".
// capturas: as últimas desta tela (com a de agora); ps5: a janela é o Remote Play do PS5 (chiaki-ng)
function motivoEnvio(r, { capturas = [], ps5 = false } = {}) {
  const lim = r.limitePct || {};
  const banda = (lim.bandwidth || 0) > 30 || r.limite === 'bandwidth';
  const cpu = (lim.cpu || 0) > 30 || r.limite === 'cpu';
  if (r.imagemBaixa) return banda ? 'internet' : cpu ? 'cpu' : 'internet';
  if (r.enviado == null || r.enviado >= BOM) return null;
  // presa perto de 30 (o limite de quadros em segundo plano da NVIDIA, a janela sem foco): 'fundo'.
  // Presa: SEGUIDAS amostras na faixa e quase iguais. Uma só (a captura caindo aos trancos) não é isso.
  const validas = capturas.filter((c) => c != null);
  const presa = validas.length >= SEGUIDAS && validas.every((c) => c >= 26 && c <= 38) && Math.max(...validas) - Math.min(...validas) <= 8;
  if (r.captura != null && r.captura >= 26 && r.captura <= 38 && presa) return 'fundo';
  if (r.captura != null && r.captura < BOM) return ps5 ? 'ps5' : 'captura';
  // modo turbo: a captura veio inteira e os quadros ficaram de fora pela fila de envio cheia
  if (r.turbo) return r.turbo.puladosFila > 0 ? 'fila' : 'codificador';
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
  // decodifica bem mais do que mostra (iPhone: 54 decodificados, 21–30 na tela): é a tela, mesmo
  // com uma travada no meio
  if (r.naTela != null && r.decodificado >= 40 && r.naTela < r.decodificado * 0.7) return 'tela';
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
    ritmo: resumoRitmo(amostras),
    engasgosMarcados: amostras.reduce((n, a) => n + (a.engasgos?.length || 0), 0),
  };
}

// O ritmo da sessão inteira, separado por modo (turbo e vídeo normal): de quantas em quantas voltas
// da tela vieram os quadros (somado), os trancos por minuto e as travadas por causa.
function resumoRitmo(amostras) {
  const modos = {};
  for (const a of amostras) {
    const r = a.ritmo;
    if (!r) continue;
    const m = (modos[a.modo || 'video'] ??= { amostras: 0, quadros: 0, emVsyncs: [0, 0, 0, 0, 0], trancos: 0, invisiveis: 0, travadas: 0, porCausa: {}, maiorMs: 0 });
    m.amostras++;
    m.quadros += r.quadros || 0;
    (r.emVsyncs || []).forEach((n, k) => { m.emVsyncs[k] += n; });
    m.trancos += r.trancos || 0;
    m.invisiveis += r.invisiveis || 0;
    m.maiorMs = Math.max(m.maiorMs, r.maiorMs || 0);
    for (const t of r.travadas || []) {
      m.travadas++;
      const c = t.causa || 'sem causa';
      m.porCausa[c] = (m.porCausa[c] || 0) + 1;
    }
  }
  for (const m of Object.values(modos)) m.trancosPorMin = Math.round((m.trancos / Math.max(1, m.amostras * 2)) * 60 * 10) / 10;
  return Object.keys(modos).length ? modos : null;
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
