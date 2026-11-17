// Vice (GTA VI): a Baía Tropical inteira, igual, com o cinema no clima de GTA VI — paredes roxas,
// neon rosa e laranja de pôr do sol, cartazes nas paredes e o letreiro "VICE CINEMA" na porta.
// Só o cinema muda (world.js lê o campo cinema); a cidade, as atrações e o tema são os do tropical.
//
// Imagens próprias em public/img/cinema-gta/: poster.jpg é o cartaz grande em cima do telão (a capa,
// 16:9), parede1.jpg a parede6.jpg são os das laterais (1-3 na oeste, 4-6 na leste, a da porta) e
// fundo1.jpg e fundo2.jpg os do fundo. Cada uma que faltar fica com o desenho do world.js.
import { TROPICAL } from './mapa-tropical.js';

export const VICE = {
  ...TROPICAL,
  nome: 'Vice (GTA VI)',
  desc: 'A Baía Tropical com o cinema no clima de GTA VI: neon rosa, pôr do sol e cartazes',
  cor: '#ff4fa3',
  cinema: 'gta',
};
