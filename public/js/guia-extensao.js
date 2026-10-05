// Guia de instalação da extensão de controle ("Sala 3D — controle das abas").
//
// Sem loja: baixa o .zip (o servidor monta a partir de extensao/), extrai, liga o modo do
// desenvolvedor do Chrome e carrega a pasta. Enquanto o guia está aberto, a página pergunta à
// extensão a cada 1,5 s se ela já chegou (a extensão, ao ser instalada, se injeta nas abas que já
// estavam abertas) e marca os passos sozinha: instalada, liberada, pronta.

import { icon } from './icons.js';
import { VideoGuia, CENA_DO_PASSO } from './guia-video.js';

const PASSOS = ['baixar', 'abrir', 'dev', 'carregar', 'liberar'];
const semMovimento = matchMedia('(prefers-reduced-motion: reduce)');

export class GuiaExtensao {
  constructor({ raiz, controle }) {
    this.raiz = raiz;
    this.controle = controle;
    this.timer = 0;
    this.video = new VideoGuia(raiz.querySelector('#guia-video'));
    raiz.addEventListener('click', (e) => {
      if (e.target === raiz || e.target.closest('[data-guia="fechar"]')) this.fechar();
      if (e.target.closest('[data-guia="copiar"]')) this.copiar(e.target.closest('[data-guia="copiar"]'));
      // clicar num passo mostra ele no vídeo (menos nos botões e links de dentro dele)
      const passo = e.target.closest('[data-passo]');
      if (passo && !e.target.closest('a, button')) this.video.tocar(CENA_DO_PASSO[passo.dataset.passo]);
    });
    raiz.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.fechar();
      }
    });
  }

  get aberto() { return !this.raiz.hidden; }

  // foco: 'janelas' abre direto a parte do ajudante (janela e tela inteira)
  abrir(foco = null) {
    this.raiz.hidden = false;
    this.raiz.querySelector('#guia-janelas').open = foco === 'janelas';
    this.atualizar();
    // o vídeo começa no passo que falta (quem pede menos movimento no sistema dá o play)
    const { ok, liberado } = this.controle.ext;
    const cena = CENA_DO_PASSO[!ok ? 'baixar' : !liberado ? 'liberar' : 'baixar'];
    if (semMovimento.matches) this.video.mostrar(cena);
    else this.video.tocar(cena);
    clearInterval(this.timer);
    this.timer = setInterval(() => window.postMessage({ sala3d: 'ping' }, location.origin), 1500);
    window.postMessage({ sala3d: 'ping' }, location.origin);
    this.raiz.querySelector('.guia-card').focus();
  }

  fechar() {
    this.raiz.hidden = true;
    clearInterval(this.timer);
    this.video.parar();
  }

  async copiar(btn) {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      btn.innerHTML = `${icon('copy', 14)}Copiado!`;
      setTimeout(() => { btn.innerHTML = `${icon('copy', 14)}Copiar`; }, 1800);
    } catch { /* sem permissão de área de transferência: o endereço está escrito ao lado */ }
  }

  // chamado sempre que a extensão responde (Controle.onExtensao)
  atualizar() {
    const { ok, liberado, versao } = this.controle.ext;
    // passos 1–4 se confirmam juntos: a extensão respondeu = foi instalada
    const feito = { baixar: ok, abrir: ok, dev: ok, carregar: ok, liberar: ok && liberado };
    const atual = PASSOS.find((p) => !feito[p]);
    for (const p of PASSOS) {
      const li = this.raiz.querySelector(`[data-passo="${p}"]`);
      li.classList.toggle('feito', feito[p]);
      li.classList.toggle('atual', p === atual);
    }
    const st = this.raiz.querySelector('#guia-status');
    st.className = `guia-status ${ok && liberado ? 'pronto' : ok ? 'meio' : ''}`;
    st.innerHTML = ok && liberado
      ? `${icon('cursor', 16)}<span><b>Tudo pronto.</b> Nas suas telas, use "Permitir controle" — ou "Permitir controle em todas".</span>`
      : ok
        ? `${icon('cursor', 16)}<span><b>Extensão instalada${versao ? ` (versão ${versao})` : ''}.</b> Falta só liberar este site (passo 5).</span>`
        : `${icon('x', 16)}<span><b>Extensão ainda não encontrada.</b> Siga os passos — esta tela confere sozinha.</span>`;
  }
}
