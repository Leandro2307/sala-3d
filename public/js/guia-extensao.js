// Guia de instalação da extensão de controle ("Sala 3D — controle das abas").
//
// Sem loja: baixa o .zip (o servidor monta a partir de extensao/), extrai, liga o modo do
// desenvolvedor do Chrome e carrega a pasta. Enquanto o guia está aberto, a página pergunta à
// extensão a cada 1,5 s se ela já chegou (a extensão, ao ser instalada, se injeta nas abas que já
// estavam abertas) e marca os passos sozinha: instalada, liberada, pronta.
//
// Extensão mais velha que a do servidor (versaoNova, do /config): o guia diz como atualizar — baixar
// de novo, extrair por cima e clicar em Recarregar. Ele também mostra se o ajudante do Windows
// (janelas e tela inteira) está instalado, e confere na hora se a pessoa pedir.

import { icon } from './icons.js';
import { VideoGuia, CENA_DO_PASSO } from './guia-video.js';
import { versaoNum } from './controle.js';

const PASSOS = ['baixar', 'abrir', 'dev', 'carregar', 'liberar'];
const semMovimento = matchMedia('(prefers-reduced-motion: reduce)');

export class GuiaExtensao {
  // versaoNova(): a versão da extensão que este servidor entrega (null: não sabe)
  constructor({ raiz, controle, versaoNova = () => null }) {
    this.raiz = raiz;
    this.controle = controle;
    this.versaoNova = versaoNova;
    this.timer = 0;
    this.conferindo = false;
    this.video = new VideoGuia(raiz.querySelector('#guia-video'));
    raiz.addEventListener('click', (e) => {
      if (e.target === raiz || e.target.closest('[data-guia="fechar"]')) this.fechar();
      if (e.target.closest('[data-guia="copiar"]')) this.copiar(e.target.closest('[data-guia="copiar"]'));
      if (e.target.closest('[data-guia="conferir"]')) this.conferir();
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

  // a extensão instalada é mais velha que a deste servidor?
  get desatualizada() {
    const { ok, versao } = this.controle.ext;
    const nova = this.versaoNova();
    return ok && !!nova && versaoNum(versao) < versaoNum(nova);
  }

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

  // abre o ajudante só para ver se ele está lá (a resposta também chega pelo "oi" da extensão)
  async conferir() {
    if (this.conferindo || !this.controle.ext.ok) return;
    this.conferindo = true;
    this.atualizar();
    const r = await this.controle.conferirNativo();
    if (r?.nativo && typeof r.nativo === 'object') this.controle.ext.nativo = r.nativo;
    this.conferindo = false;
    this.atualizar();
  }

  // chamado sempre que a extensão responde (Controle.onExtensao)
  atualizar() {
    const { ok, liberado, versao, nativo } = this.controle.ext;
    // passos 1–4 se confirmam juntos: a extensão respondeu = foi instalada
    const feito = { baixar: ok, abrir: ok, dev: ok, carregar: ok, liberar: ok && liberado };
    const atual = PASSOS.find((p) => !feito[p]);
    for (const p of PASSOS) {
      const li = this.raiz.querySelector(`[data-passo="${p}"]`);
      li.classList.toggle('feito', feito[p]);
      li.classList.toggle('atual', p === atual);
    }
    const velha = this.desatualizada;
    this.raiz.querySelector('#guia-titulo').textContent = velha ? 'Atualizar a extensão de controle' : 'Instalar a extensão de controle';
    const st = this.raiz.querySelector('#guia-status');
    st.className = `guia-status ${ok && liberado && !velha ? 'pronto' : ok ? 'meio' : ''}`;
    st.innerHTML = velha
      ? `${icon('extensao', 16)}<span><b>Tem uma versão nova da extensão (${this.versaoNova()}).</b> A sua é a ${versao}: atualize para ter tudo o que a sala oferece.</span>`
      : ok && liberado
        ? `${icon('cursor', 16)}<span><b>Tudo pronto.</b> Nas suas telas, use "Permitir controle" — ou "Permitir controle em todas".</span>`
        : ok
          ? `${icon('cursor', 16)}<span><b>Extensão instalada${versao ? ` (versão ${versao})` : ''}.</b> Falta só liberar este site (passo 5).</span>`
          : `${icon('x', 16)}<span><b>Extensão ainda não encontrada.</b> Siga os passos — esta tela confere sozinha.</span>`;
    this.raiz.querySelector('#guia-atualizar').hidden = !velha;
    // o ajudante do Windows: o que a extensão sabe da última vez que ele abriu (a de antes da 1.11
    // não conta, nem sabe conferir)
    const sabe = ok && versaoNum(versao) >= versaoNum('1.11');
    const nat = this.raiz.querySelector('#guia-nativo');
    nat.innerHTML = !sabe ? ''
      : this.conferindo ? 'Conferindo o ajudante…'
        : nativo?.ok ? `<b>Ajudante instalado${nativo.versao ? ` (versão ${nativo.versao})` : ''}.</b>`
          : nativo?.erro === 'ausente' ? 'Ajudante não encontrado neste PC.'
            : nativo ? 'O ajudante não abriu da última vez.' : 'Ainda não se sabe se o ajudante está instalado.';
    const conferir = this.raiz.querySelector('[data-guia="conferir"]');
    conferir.hidden = !sabe || !!nativo?.ok;
    conferir.disabled = this.conferindo;
  }
}
