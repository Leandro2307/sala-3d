// Abertura da página: o formulário de entrada (nome, cor, personagem, camiseta, foto, sala) e as
// salas ao vivo funcionam na hora, sem esperar o resto. Este módulo é pequeno e não usa o three.js;
// a sala em si (main.js, ~90 módulos e o mapa 3D) baixa e é montada depois, por trás, com a barra
// de progresso embaixo do "Entrar na sala". Antes era tudo junto: o formulário só respondia quando
// o último script chegava e o mapa inteiro estava montado — no celular, com cache limpo, vários
// segundos de tela parada.
//
// Quando o main.js chega no formulário ele chama soltar(): daqui para a frente o formulário é dele
// (estes ouvintes saem). O que a pessoa mudou até ali já está no localStorage ('sala3d'), que é de
// onde o main.js lê os ajustes. Quem apertou "Entrar" antes disso entra assim que a sala fica pronta.
import { PERSONAGENS } from './personagens.js';
import { EscolherPersonagem } from './escolher-personagem.js';
import { AoVivo, cartaoDoSaguao } from './aovivo.js';
import { hydrateIcons, icon } from './icons.js';
import { isTouch, toggleFullscreen, isFullscreen, temTelaCheia } from './touch.js';
import { photoFromFile } from './foto.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// as mesmas do main.js (COLORS): a primeira é a cor de quem nunca escolheu
const CORES = ['#7c9cff', '#6ee7c8', '#f472b6', '#fbbf24', '#a78bfa', '#fb7185', '#38bdf8', '#a3e635', '#f97316', '#e2e8f0'];
const idDaSala = (raw) => String(raw || '').trim().slice(0, 40).toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'principal';

function lerAjustes() {
  try { return JSON.parse(localStorage.getItem('sala3d') || '{}'); } catch { return {}; }
}
// grava só os campos do formulário, por cima do que já estava salvo (o resto é do main.js)
function salvar(campos) {
  try { localStorage.setItem('sala3d', JSON.stringify({ ...lerAjustes(), ...campos })); } catch { /* modo privado */ }
}
function lerPasses() {
  try { return JSON.parse(localStorage.getItem('sala3d-passes') || '{}'); } catch { return {}; }
}

const salvo = lerAjustes();
const aj = {
  name: salvo.name || '',
  color: salvo.color || CORES[0],
  char: PERSONAGENS[salvo.char] ? salvo.char : 'padrao',
  shirt: salvo.shirt || 'none',
  photo: salvo.photo || null,
  mic: salvo.mic !== false,
};

const fim = new AbortController(); // soltar(): todos os ouvintes daqui saem de uma vez
const ouvir = (alvo, ev, fn) => alvo.addEventListener(ev, fn, { signal: fim.signal });
const params = new URLSearchParams(location.search);
const nameInput = $('#in-name');
const roomInput = $('#in-room');

hydrateIcons($('#lobby'));
hydrateIcons($('#escolher-personagem'));
if (isTouch) {
  document.body.classList.add('touch');
  $('#lobby-note').hidden = true;
  $('#lobby-note-touch').hidden = false;
}
nameInput.value = aj.name;
roomInput.value = params.get('sala') || '';
$('#in-mic').checked = aj.mic;

// ---------------------------------------------------------------- campos
ouvir(nameInput, 'input', () => salvar({ name: nameInput.value.trim() }));
ouvir($('#in-mic'), 'change', (e) => salvar({ mic: e.target.checked }));

function renderCores() {
  const html = CORES.map((c) => `<button type="button" role="radio" aria-label="Cor ${c}" aria-checked="${c === aj.color}" style="--c:${c}" data-color="${c}"></button>`).join('');
  $('#swatches').innerHTML = html;
  $('#ep-cores').innerHTML = html;
}
renderCores();
for (const sel of ['#swatches', '#ep-cores']) {
  ouvir($(sel), 'click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b || b.dataset.color === aj.color) return;
    aj.color = b.dataset.color;
    salvar({ color: aj.color });
    renderCores();
    escolha.reverPrevia();
  });
}

function renderCamiseta() {
  $$('#in-shirt button, #ep-camiseta button').forEach((b) => b.classList.toggle('on', b.dataset.shirt === aj.shirt));
}
renderCamiseta();
for (const sel of ['#in-shirt', '#ep-camiseta']) {
  ouvir($(sel), 'click', (e) => {
    const b = e.target.closest('[data-shirt]');
    if (!b || b.dataset.shirt === aj.shirt) return;
    aj.shirt = b.dataset.shirt;
    salvar({ shirt: aj.shirt });
    renderCamiseta();
    escolha.reverPrevia();
  });
}

function renderFoto() {
  const box = $('#photo-prev');
  if (aj.photo) {
    box.innerHTML = '';
    const img = new Image();
    img.src = aj.photo;
    img.alt = '';
    box.appendChild(img);
  } else {
    box.innerHTML = icon('user', 22);
  }
  $('#photo-clear').hidden = !aj.photo;
}
renderFoto();
function mudarFoto(foto) {
  aj.photo = foto;
  salvar({ photo: foto });
  renderFoto();
}
ouvir($('#photo-pick'), 'click', () => $('#photo-file').click());
ouvir($('#photo-file'), 'change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    mudarFoto(await photoFromFile(file));
  } catch (err) {
    $('#lobby-note').textContent = err.message;
  }
});
ouvir($('#photo-clear'), 'click', () => mudarFoto(null));

// ---------------------------------------------------------------- personagem
function renderPersonagem() {
  const def = PERSONAGENS[aj.char] || PERSONAGENS.padrao;
  $('#char-mini').src = def.miniatura;
  $('#char-nome').textContent = def.label;
  $('#char-resumo').textContent = def.resumo || '';
  // camiseta e foto só existem no boneco padrão: o modelo 3D tem o corpo dele
  $('#campo-camiseta').hidden = !!def.url;
  $('#campo-foto').hidden = !!def.url;
  const linha = [];
  if (def.aviso) linha.push(def.aviso);
  if (def.credito) linha.push('Modelo: ' + def.credito);
  $('#char-credito').textContent = linha.join(' · ');
}
renderPersonagem();
// O modal é o mesmo de dentro da sala: o main.js fica com esta instância e troca as funções dela
// pelas dele (ver soltar). A prévia 3D (vitrine.js, com o three.js) só baixa quando ele abre.
const escolha = new EscolherPersonagem({
  raiz: $('#escolher-personagem'),
  aparencia: () => ({ cor: aj.color, camiseta: aj.shirt, foto: aj.photo }),
  aoEscolher: (id) => {
    aj.char = id;
    salvar({ char: id });
    renderPersonagem();
  },
  aoSelecionar: (def) => { $('#ep-linha-camiseta').hidden = !!def.url; },
});
ouvir($('#in-char'), 'click', () => escolha.abrir(aj.char));

// No celular camiseta e foto ficam recolhidas (style.css, "entrada no celular"). Fica ligado mesmo
// depois do soltar(): o main.js não mexe nisto.
$('#lobby-mais').addEventListener('click', (e) => {
  const aberto = $('#lobby-form').classList.toggle('mais-aberto');
  e.currentTarget.setAttribute('aria-expanded', String(aberto));
});

// ---------------------------------------------------------------- sala e senha
ouvir(roomInput, 'input', () => {
  $('#campo-senha-sala').hidden = true;
  $('#in-senha-sala').value = '';
});
// veio por um convite de sala com senha: já mostra o campo (sem gastar tentativa)
if (params.get('sala')) {
  const sala = idDaSala(params.get('sala'));
  fetch('/sala-acesso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sala, passe: lerPasses()[sala] }),
  }).then((r) => r.json()).then((r) => {
    if (r.protegida && !r.ok) {
      $('#campo-senha-sala').hidden = false;
      $('#senha-sala-erro').hidden = true;
    }
  }).catch(() => {});
}

// salas ao vivo: a conexão continua a mesma dentro da sala (o main.js a herda)
const aoVivo = new AoVivo();
const redesenharSaguao = cartaoDoSaguao(aoVivo, {
  lista: $('#ao-vivo-lista'),
  resumo: $('#ao-vivo-resumo'),
  selecionada: () => idDaSala(roomInput.value),
  aoEscolher: (id) => {
    roomInput.value = id;
    roomInput.dispatchEvent(new Event('input'));
    (nameInput.value.trim() ? $('#btn-join') : nameInput).focus();
  },
  sinal: fim.signal,
});
ouvir(roomInput, 'input', () => redesenharSaguao());

// O navegador avisa que dá para instalar o app uma vez só, e pode ser antes de o main.js chegar:
// guarda o aviso para ele.
let pedidoDeInstalacao = null;
ouvir(window, 'beforeinstallprompt', (e) => {
  e.preventDefault();
  pedidoDeInstalacao = e;
});

// ---------------------------------------------------------------- entrar e carregar
const btn = $('#btn-join');
const carga = $('#lobby-carga');
const barra = $('#lc-barra');
const textoCarga = $('#lc-texto');
let querEntrar = false;
let falhou = false;

// 0–60%: baixar os módulos; 60–95%: montar o mapa (main.js avisa); o resto: ligar a sala
function progresso(f, texto) {
  barra.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
  if (texto) textoCarga.textContent = texto;
  if (querEntrar) btn.textContent = `Entrando… ${Math.round(f * 100)}%`;
}

ouvir($('#lobby-form'), 'submit', (e) => {
  e.preventDefault();
  if (falhou) return location.reload();
  if (!nameInput.value.trim()) return nameInput.focus();
  salvar({ name: nameInput.value.trim(), mic: $('#in-mic').checked });
  // Celular: a sala é sempre deitada. No Android a trava de orientação só vale em tela cheia, que
  // precisa deste toque (o main.js faz o mesmo no formulário dele)
  if (isTouch && temTelaCheia && !isFullscreen()) toggleFullscreen();
  querEntrar = true;
  btn.disabled = true;
  carga.classList.add('esperando');
  progresso(Number(barra.dataset.f || 0));
});

// Miniaturas dos personagens (~190 kB no total): logo depois do formulário, antes do mapa, para o
// modal abrir com todas já na tela.
function adiantarMiniaturas() {
  for (const p of Object.values(PERSONAGENS)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = p.miniatura;
  }
}

// A lista de módulos da sala vem na página (pagina.js), com a impressão digital de cada um: pedidos
// todos de uma vez (modulepreload), em vez de o navegador descobrir um import depois do outro.
function baixarSala() {
  let lista = [];
  try { lista = JSON.parse($('#sala3d-modulos')?.textContent || '[]'); } catch { /* sem lista: só o import */ }
  let prontos = 0;
  const um = () => {
    prontos++;
    const f = 0.6 * (prontos / lista.length);
    barra.dataset.f = f;
    progresso(f, 'Baixando a sala…');
  };
  for (const href of lista) {
    const l = document.createElement('link');
    l.rel = 'modulepreload';
    l.href = href;
    l.onload = l.onerror = um;
    document.head.appendChild(l);
  }
  progresso(0, 'Baixando a sala…');
  import('./main.js').catch((err) => {
    console.error(err);
    falhou = true;
    carga.classList.add('erro');
    progresso(1, 'Não consegui carregar a sala. Confira a internet.');
    btn.disabled = false;
    btn.textContent = 'Tentar de novo';
  });
}

// Primeiro o formulário aparece (CSS e este módulo); no quadro seguinte começam as miniaturas e
// a sala, que disputariam a rede e o processador com ele.
requestAnimationFrame(() => setTimeout(() => {
  adiantarMiniaturas();
  baixarSala();
}, 0));

window.sala3dEntrada = {
  escolha,
  aoVivo,
  get pedidoDeInstalacao() { return pedidoDeInstalacao; },
  // montagem do mapa (world.construir): f de 0 a 1
  mapa(f) {
    barra.dataset.f = 0.6 + 0.35 * f;
    progresso(0.6 + 0.35 * f, 'Montando o mapa…');
  },
  // o main.js assume o formulário: devolve se a pessoa já pediu para entrar
  soltar() {
    fim.abort();
    progresso(0.97, 'Ligando a sala…');
    const entrar = querEntrar;
    querEntrar = false; // o botão agora é do join() do main.js
    return { entrar };
  },
  // tudo pronto (fim do main.js): a barra some
  pronto() {
    progresso(1, 'Sala pronta');
    carga.classList.add('ok');
    setTimeout(() => { carga.hidden = true; }, 1200);
  },
};
