// Liberar (ou tirar) o site da Sala 3D. Só os sites desta lista podem pedir para controlar abas.
const $ = (s) => document.querySelector(s);

async function sites() {
  return (await chrome.storage.local.get('sites')).sites || [];
}

async function desenhar() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origem = null;
  try {
    if (/^https?:/.test(aba?.url || '')) origem = new URL(aba.url).origin;
  } catch { /* aba interna do Chrome */ }
  const lista = await sites();
  const btn = $('#btn');
  if (origem) {
    const tem = lista.includes(origem);
    $('#txt').innerHTML = tem
      ? `<span class="site">${origem}</span> está liberado. Na sala, ligue "Permitir controle" na tela que quiser.`
      : `Liberar <span class="site">${origem}</span>? Só faça isso no endereço da sua Sala 3D: o site liberado pode pedir para controlar as abas que você compartilhar.`;
    btn.hidden = false;
    btn.textContent = tem ? 'Tirar este site' : 'Liberar este site';
    btn.className = tem ? 'tirar' : '';
    btn.onclick = async () => {
      const atual = await sites();
      const novo = tem ? atual.filter((s) => s !== origem) : [...atual, origem];
      await chrome.storage.local.set({ sites: novo });
      // avisa a página na hora (sem recarregar: recarregar derrubaria a pessoa da sala)
      chrome.tabs.sendMessage(aba.id, { tipo: 'status-mudou' }).catch(() => {});
      desenhar();
    };
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

desenhar();
