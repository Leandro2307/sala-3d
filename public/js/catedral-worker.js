// A malha da catedral (catedral-malha.js) montada fora da thread do 3D: são ~0,8 s de conta num
// PC (bem mais num celular), que antes travavam a tela logo na abertura da sala.
// Pedido: { dados: { L, A, C, paleta, grade }, texBlocos }. Resposta: { lotes, colisoes } ou { erro }.
import { montarCatedral } from './catedral-malha.js';

self.onmessage = ({ data: { dados, texBlocos } }) => {
  try {
    const { lotes, colisoes } = montarCatedral(dados, { texBlocos });
    const enviar = [];
    for (const lt of lotes) enviar.push(lt.pos.buffer, lt.nor.buffer, lt.uv.buffer, lt.cor.buffer, lt.idx.buffer);
    self.postMessage({ lotes, colisoes }, enviar);
  } catch (e) {
    self.postMessage({ erro: String(e?.message || e) });
  }
};
