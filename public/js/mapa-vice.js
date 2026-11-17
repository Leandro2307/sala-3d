// Vice (GTA VI): a Baía Tropical inteira, igual, com o cinema no clima de GTA VI — paredes roxas,
// neon rosa e laranja de pôr do sol, cartazes nas paredes e o letreiro "VICE CINEMA" na porta.
// Só o cinema muda (world.js lê o campo cinema); a cidade, as atrações e o tema são os do tropical.
//
// Cartaz próprio: ponha uma imagem em public/img/cinema-gta/poster.jpg (paisagem, 16:9) e ela entra
// no lugar do cartaz grande em cima do telão.
import { TROPICAL } from './mapa-tropical.js';

export const VICE = {
  ...TROPICAL,
  nome: 'Vice (GTA VI)',
  desc: 'A Baía Tropical com o cinema no clima de GTA VI: neon rosa, pôr do sol e cartazes',
  cor: '#ff4fa3',
  cinema: 'gta',
};
