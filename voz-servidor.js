// Static card-game bot voices. Files are generated once by scripts/gerar-vozes-cartas.js
// and committed under public/audio/cartas, so the running game never calls a TTS API.
const crypto = require('crypto');

function arquivoDaFrase(frase, lugar) {
  if (typeof frase !== 'string' || !frase.trim()) return null;
  const voz = Math.abs(Number(lugar) || 0) % 2;
  const id = crypto.createHash('sha1').update(`${voz}:${frase}`).digest('hex').slice(0, 16);
  return `/audio/cartas/${voz}-${id}.mp3`;
}

function urlDaFrase(frase, lugar) {
  return arquivoDaFrase(frase, lugar);
}

// Kept for the game-server startup call. Generation belongs to the build step, not runtime.
function esquentar() {}

// Old clients may still request the former in-memory endpoint during a rolling deploy.
function servir(_req, res) {
  res.status(410).end();
}

module.exports = { arquivoDaFrase, urlDaFrase, esquentar, servir };
