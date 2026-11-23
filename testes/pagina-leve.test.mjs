// As páginas leves (/tv e /jogar) montadas pelo pagina.js, como em produção: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

process.env.NODE_ENV = 'production';
const { paginaLeve, moduloVersionado } = createRequire(import.meta.url)('../pagina.js');
const PUBLICO = new URL('../public', import.meta.url);

for (const [arq, entrada] of [['tv.html', '/js/tv.js'], ['jogar.html', '/js/jogar.js']]) {
  const html = paginaLeve(arq, entrada);
  const pedidos = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);

  test(`${arq}: a entrada e os módulos vão com a impressão certa no endereço`, () => {
    assert.ok(html.includes(`src="${entrada}?v=${moduloVersionado(entrada).hash}"`));
    assert.ok(pedidos.length >= 4);
    for (const p of pedidos) {
      const [url, v] = p.split('?v=');
      assert.ok(fs.existsSync(new URL(`.${url}`, `${PUBLICO}/`)), url);
      assert.equal(v, moduloVersionado(url).hash, url);
    }
  });

  test(`${arq}: todo import estático da entrada está na lista (nada é descoberto só depois)`, () => {
    const codigo = moduloVersionado(entrada).codigo;
    const imports = [...codigo.matchAll(/^import [^'"]*['"]\.\/([^'"]+)['"]/gm)].map((m) => `/js/${m[1]}`);
    assert.ok(imports.length > 0);
    for (const i of imports) assert.ok(pedidos.includes(i), i);
  });

  test(`${arq}: o socket.io menor, com a versão no endereço, antes do módulo`, () => {
    assert.match(html, /src="\/vendor\/socket\.io@[\d.]+\/socket\.io\.min\.js"/);
    assert.ok(!html.includes('/socket.io/socket.io.js'));
    assert.ok(html.indexOf('socket.io.min.js') < html.indexOf(`src="${entrada}?`));
  });
}

test('a TV não baixa o Turbo nem a vibração na abertura', () => {
  const html = paginaLeve('tv.html', '/js/tv.js');
  for (const m of ['turbo.js', 'pad-virtual.js', 'toque-tv.js']) assert.ok(!html.includes(`/js/${m}`), m);
  // mas os dinâmicos também vão com a impressão (cache de um ano)
  for (const m of ['turbo.js', 'pad-virtual.js']) assert.match(moduloVersionado('/js/tv.js').codigo, new RegExp(`import\\('\\./${m}\\?v=${moduloVersionado(`/js/${m}`).hash}'\\)`));
});
