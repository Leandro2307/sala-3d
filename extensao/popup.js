// O popup do ícone: mostrar (ou tirar) a aba da frente na Sala 3D, cortar o controle de quem está
// mexendo e liberar (ou tirar) o site da sala — só os sites desta lista podem pedir controle.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pedir = (m) => chrome.runtime.sendMessage(m).catch((e) => ({ erro: String(e?.message || e) }));
const teclas = (a) => a.split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('+');

async function sites() {
  return (await chrome.storage.local.get('sites')).sites || [];
}

// a aba é uma Sala 3D? (a página da sala tem <meta name="sala3d">) — só ela é oferecida para liberar
async function ehSala(aba) {
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: aba.id }, func: () => !!document.querySelector('meta[name="sala3d"]') });
    return !!r?.result;
  } catch {
    return false; // página do Chrome, ou que a extensão não pode ler
  }
}

let aba = null;

async function desenhar() {
  [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  const p = await pedir({ tipo: 'painel', aba: aba?.id });
  desenharAba(p);
  desenharControle(p);
  await desenharSites();
  desenharRodape(p);
}

// Mostrar esta aba na sala (sem a faixa "Compartilhando..." do Chrome): abrir o popup é o que deixa
// a extensão capturar esta aba. Se ela já está na sala, o mesmo botão tira.
function desenharAba(p) {
  const pode = /^(https?|file):/.test(aba?.url || '');
  $('#aba').hidden = !pode;
  if (!pode) return;
  const naSala = !!p?.compartilhada;
  $('#aba-titulo').textContent = naSala ? 'Esta aba está na sala' : 'Mostrar esta aba na sala';
  $('#aba-txt').textContent = naSala ? 'Quem está na sala está vendo esta aba.'
    : p?.sala ? 'Ela vai para uma tela livre da sala, com som — sem a faixa “Compartilhando…” do Chrome no topo.'
      : 'Primeiro abra a Sala 3D (com o site dela liberado aqui embaixo).';
  const btn = $('#aba-btn');
  btn.textContent = naSala ? 'Parar de mostrar esta aba' : 'Mostrar esta aba na Sala 3D';
  btn.className = naSala ? 'tirar' : '';
  btn.disabled = false;
  btn.onclick = async () => {
    const msg = $('#aba-msg');
    btn.disabled = true;
    msg.hidden = false;
    msg.className = 'msg';
    msg.textContent = naSala ? 'Tirando da sala…' : 'Mandando para a sala…';
    const r = await pedir({ tipo: 'compartilhar-aba', aba: aba.id });
    btn.disabled = false;
    msg.className = r?.ok ? 'msg' : 'msg erro';
    msg.textContent = !r?.ok ? r?.erro || 'Não deu certo.'
      : r.parou ? 'Pronto: a aba saiu da sala.' : `Pronto: a aba já aparece na sala${r.onde ? ` (${r.onde})` : ''}.`;
    if (r?.ok) setTimeout(() => window.close(), 1200);
  };
  // o atalho como está no Chrome (a pessoa pode ter trocado, ou outra extensão ficou com ele)
  $('#atalho').innerHTML = p?.atalho ? `Atalho nesta aba: ${teclas(p.atalho)}` : 'Sem atalho de teclado';
  $('#atalho-trocar').textContent = p?.atalho ? 'trocar' : 'definir um';
  $('#atalho-trocar').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
}

function desenharControle(p) {
  const lista = p?.controladas || [];
  $('#ctrl').hidden = !lista.length;
  if (!lista.length) return;
  const nomes = lista.map((t) => (t.length > 40 ? `${t.slice(0, 39)}…` : t));
  $('#ctrl-txt').textContent = `Quem você liberou na sala está controlando: ${nomes.join(', ')}. Cortar desliga a permissão; para deixar de novo, libere na sala.`;
  const btn = $('#ctrl-btn');
  btn.disabled = false;
  btn.onclick = async () => {
    btn.disabled = true;
    await pedir({ tipo: 'cortar' });
    desenhar();
  };
}

async function desenharSites() {
  let origem = null;
  try {
    if (/^https?:/.test(aba?.url || '')) origem = new URL(aba.url).origin;
  } catch { /* aba interna do Chrome */ }
  const lista = await sites();
  const tem = !!origem && lista.includes(origem);
  // liberar só é oferecido na própria Sala 3D; tirar, em qualquer site que esteja na lista
  const oferecer = !!origem && (tem || (await ehSala(aba)));
  const btn = $('#btn');
  btn.hidden = !oferecer;
  if (oferecer) {
    $('#txt').innerHTML = tem
      ? `<span class="site">${esc(origem)}</span> está liberado. Na sala, ligue "Permitir controle" na tela que quiser.`
      : `Liberar <span class="site">${esc(origem)}</span>? Só faça isso no endereço da sua Sala 3D: o site liberado pode pedir para controlar as abas que você compartilhar.`;
    btn.textContent = tem ? 'Tirar este site' : 'Liberar este site';
    btn.className = tem ? 'tirar' : '';
    btn.onclick = async () => {
      const atual = await sites();
      await chrome.storage.local.set({ sites: tem ? atual.filter((s) => s !== origem) : [...atual, origem] });
      // avisa a página na hora (sem recarregar: recarregar derrubaria a pessoa da sala)
      chrome.tabs.sendMessage(aba.id, { tipo: 'status-mudou' }).catch(() => {});
      desenhar();
    };
  } else {
    $('#txt').textContent = lista.length ? 'Para liberar outra sala, clique aqui com a aba dela na frente.' : 'Abra a aba da Sala 3D e clique aqui de novo.';
  }
  $('#lista').innerHTML = lista.length ? '' : '<li>Nenhum site liberado ainda.</li>';
  for (const s of lista) {
    const li = document.createElement('li');
    li.textContent = s;
    const b = document.createElement('button');
    b.className = 'tirar';
    b.textContent = 'Tirar';
    b.onclick = async () => {
      await chrome.storage.local.set({ sites: (await sites()).filter((x) => x !== s) });
      desenhar();
    };
    li.append(b);
    $('#lista').append(li);
  }
}

function desenharRodape(p) {
  const n = p?.nativo;
  const ajudante = !n ? 'ainda não usado neste PC'
    : n.ok ? `instalado${n.versao ? ` (${n.versao})` : ''}`
      : n.erro === 'ausente' ? 'não instalado (só faz falta para janelas e tela inteira)' : 'não abriu da última vez';
  $('#rodape').textContent = `Extensão ${chrome.runtime.getManifest().version} · Ajudante do Windows: ${ajudante}.`;
}

desenhar();
