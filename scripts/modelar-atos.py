# Modela o Atos — a logo do olho em espiral virada bola — no Blender, com esqueleto e as animações que o
# jogo usa, e exporta o .glb. Tudo é gerado aqui: para mudar cor, tamanho ou movimento, mude os
# números e rode de novo.
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
#     --python scripts/modelar-atos.py -- public/models/atos.glb [atos.blend]
#
# Visto de frente, o Atos É a logo: a bola é a borda de fora, o olho é a pupila com a íris, e as
# fendas pretas (o anel em volta da íris e as duas espirais que separam as lâminas) são sulcos
# fundos na bola. As espirais saem pelas laterais e se juntam numa costura fina nas costas: as duas
# lâminas se encaixam como as metades de uma bola de tênis.
#
# Frente do boneco: -Y no Blender, que o exportador converte para +Z (a frente do jogo).
# Todos os ossos apontam para cima, então no espaço de cada osso: x = esquerda do boneco,
# y = cima, z = frente.
import math
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.geometry import delaunay_2d_cdt

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SAIDA_GLB = args[0] if args else 'atos.glb'
SAIDA_BLEND = args[1] if len(args) > 1 else None

FPS = 30
R = 0.5  # raio da bola
CZ = 0.56  # centro da bola (a base afunda um pouco nos pés, que só aparecem na ponta)
CENTRO = Vector((0, 0, CZ))
FENDA = 0.05  # profundidade das fendas pretas
INCLINA = math.radians(5)  # o rosto olha um pouco para cima
# espaçamento dos pontos da casca: mais fino no rosto, onde estão os detalhes
PASSO_FRENTE = math.radians(3.0)
PASSO_COSTAS = math.radians(5.0)
PASSO_BORDA = math.radians(1.2)  # ao longo das bordas das fendas
COSTURA = math.radians(6)  # largura da costura no meio das costas (a do anel do olho)
ALCA = 0.4  # alças das curvas da costura (fração da distância entre as pontas)
VIRADA = math.radians(35)  # quanto a borda pode dobrar onde sai da logo (ver costura)

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene
cena.render.fps = FPS


# ------------------------------------------------------------------ a logo
# Medidas tiradas da logo original (1060 × 1068 px), em pixels, com a origem no centro do olho e
# y para cima. A logo é toda feita de arcos de círculo (o maior desvio do traçado é de 1 px):
#   - pupila e íris: dois círculos no centro;
#   - ANEL: a borda de dentro das duas lâminas, um círculo só, um pouco à direita do olho;
#   - cada lâmina sai do anel por uma ESPIRAL (arco grande, tangente ao anel por fora) até a borda
#     da bola, e termina em PONTA junto ao anel (outro arco, que corta o anel);
#   - a CURVINHA embaixo à direita: a lâmina B passa da borda numa ponta, entre um arco por fora
#     e uma reta (o entalhe) por dentro.
# Tudo é dividido pelo raio da borda de fora: a borda da logo vira o contorno da bola.
PX = 533.6


def circ(cx, cy, r):
    return (cx / PX, cy / PX, r / PX)


PUPILA = 126.4 / PX
IRIS = 296.7 / PX
ANEL = circ(4.6, 0.1, 346.1)
BORDA = (0.0, 0.0, 1.0)


def tangente_ao_anel(cx, cy):
    """Arco da espiral: o raio fecha a tangência com o anel (o raio do anel + a distância dos centros)."""
    cx, cy = cx / PX, cy / PX
    return (cx, cy, ANEL[2] + math.hypot(ANEL[0] - cx, ANEL[1] - cy))


A_ESPIRAL = tangente_ao_anel(76.6, -189.8)  # lâmina A: de cima e da esquerda
B_ESPIRAL = tangente_ao_anel(-85.1, 159.5)  # lâmina B: da direita e de baixo
A_PONTA = circ(-169.6, 56.7, 360.3)
B_PONTA = circ(75.3, -215.0, 531.7)
CURVINHA = circ(-115.0, -36.2, 633.2)
ENTALHE = (0.1606, 392.36 / PX)  # x = a·y + b


def cruzar(c1, c2, perto_de):
    """Cruzamento de dois círculos: o que fica mais perto do ângulo dado (graus, em volta do olho)."""
    (x1, y1, r1), (x2, y2, r2) = c1, c2
    dx, dy = x2 - x1, y2 - y1
    d = math.hypot(dx, dy)
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
    h = math.sqrt(max(0.0, r1 * r1 - a * a))
    mx, my = x1 + a * dx / d, y1 + a * dy / d
    alvo = math.radians(perto_de)
    return max(((mx + h * dy / d, my - h * dx / d), (mx - h * dy / d, my + h * dx / d)),
               key=lambda p: math.cos(math.atan2(p[1], p[0]) - alvo))


def cruzar_reta(c, reta, perto_de):
    """Cruzamento do círculo com a reta x = a·y + b: o que fica mais perto do ângulo dado."""
    cx, cy, r = c
    a, b = reta
    k = b - cx
    qa, qb, qc = a * a + 1, 2 * (a * k - cy), k * k + cy * cy - r * r
    raiz = math.sqrt(max(0.0, qb * qb - 4 * qa * qc))
    alvo = math.radians(perto_de)
    return max(((a * y + b, y) for y in ((-qb + raiz) / (2 * qa), (-qb - raiz) / (2 * qa))),
               key=lambda p: math.cos(math.atan2(p[1], p[0]) - alvo))


def tangencia(esp):
    cx, cy, r = esp
    ux, uy = ANEL[0] - cx, ANEL[1] - cy
    d = math.hypot(ux, uy)
    return (cx + r * ux / d, cy + r * uy / d)


PONTA_A = cruzar(A_PONTA, ANEL, 242)
PONTA_B = cruzar(B_PONTA, ANEL, 62)
TAN_A = tangencia(A_ESPIRAL)
TAN_B = tangencia(B_ESPIRAL)
# onde cada fenda espiral sai pela borda: a 1ª à direita, em cima; a 2ª à esquerda, embaixo
SAI_A1 = cruzar(A_ESPIRAL, BORDA, 18)
SAI_B1 = cruzar(B_PONTA, BORDA, 9)
SAI_B2 = cruzar(B_ESPIRAL, BORDA, 195)
SAI_A2 = cruzar(A_PONTA, BORDA, 185)
# a curvinha: nasce rente à borda (EMENDA), vai até a PONTA e volta pelo entalhe até a borda
CURVINHA_EMENDA = cruzar(CURVINHA, BORDA, 350)
CURVINHA_PONTA = cruzar_reta(CURVINHA, ENTALHE, 303)
CURVINHA_ENTALHE = cruzar_reta(BORDA, ENTALHE, 307)


# ------------------------------------------------------------------ a logo na bola
# Referencial do rosto: a frente é -Y e a logo fica no plano XZ (x da logo = X, y da logo = Z).
# Até MIOLO do raio, cada ponto da logo vai reto para trás até a casca: de frente a bola mostra a
# logo exata. Dali até a borda o ângulo cresce mais devagar e a borda da logo para em BORDA_TH,
# antes da lateral. Levada reta até a lateral, a faixa da borda esticava, e as fendas viravam
# cunhas pretas enormes dos lados. De frente a diferença não chega a 1%.
ROSTO = Matrix.Rotation(-INCLINA, 3, 'X')  # do referencial do rosto para o do boneco
FRENTE = ROSTO @ Vector((0, -1, 0))
CIMA_ROSTO = ROSTO @ Vector((0, 0, 1))
MIOLO = 0.86
BORDA_TH = math.radians(84)
_th0 = math.asin(MIOLO)
_s0 = 1 / math.sqrt(1 - MIOLO ** 2)  # inclinação do arco-seno no MIOLO: a emenda não tem quina
_c = (BORDA_TH - _th0 - _s0 * (1 - MIOLO)) / (1 - MIOLO) ** 2


def th_logo(r):
    """Ângulo a partir da frente do ponto da logo a uma distância r do centro."""
    if r <= MIOLO:
        return math.asin(r)
    u = min(r, 1.0) - MIOLO
    return _th0 + _s0 * u + _c * u * u


def dir_esf(th, ph):
    """th: ângulo a partir da frente; ph: ângulo em volta do eixo do rosto (0 = direita da logo)."""
    return Vector((math.sin(th) * math.cos(ph), -math.cos(th), math.sin(th) * math.sin(ph)))


def dir_logo(x, y):
    return dir_esf(th_logo(math.hypot(x, y)), math.atan2(y, x))


def costas(d):
    """Plano das costas: estereográfica a partir da frente (o polo de trás no meio, a lateral no raio 1)."""
    return Vector((d.x / (1 + d.y), d.z / (1 + d.y)))


def das_costas(p):
    q = p.length_squared
    return Vector((2 * p.x, 1 - q, 2 * p.y)) / (1 + q)


def arco2d(c, p0, p1, n=6000):
    """Pontos da logo ao longo do arco curto do círculo c, de p0 até p1."""
    cx, cy, r = c
    a0 = math.atan2(p0[1] - cy, p0[0] - cx)
    a1 = math.atan2(p1[1] - cy, p1[0] - cx)
    da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
    return [(cx + r * math.cos(a0 + da * i / n), cy + r * math.sin(a0 + da * i / n)) for i in range(n + 1)]


def arco(c, p0, p1):
    """O mesmo arco, já como direções na bola."""
    return [dir_logo(x, y) for x, y in arco2d(c, p0, p1)]


def bezier(p0, p1, p2, p3, n):
    return [p0 * (1 - t) ** 3 + p1 * 3 * (1 - t) ** 2 * t + p2 * 3 * (1 - t) * t * t + p3 * t ** 3
            for t in (i / n for i in range(n + 1))]


def limitar(d, alvo):
    """d girado até ficar a no máximo VIRADA do alvo (no plano)."""
    a = math.atan2(alvo.x * d.y - alvo.y * d.x, alvo.dot(d))
    a = max(-VIRADA, min(VIRADA, a))
    return Vector((alvo.x * math.cos(a) - alvo.y * math.sin(a), alvo.x * math.sin(a) + alvo.y * math.cos(a)))


def costura(chega, sai, lado, n=600):
    """As duas lâminas se encaixam como as metades de uma bola de tênis: cada fenda espiral sai da
    logo pela lateral e atravessa as costas até a outra, afinando até a largura do anel no meio.
    Este é um lado dessa costura (lado = +1 em cima, -1 embaixo), no plano das costas: duas curvas
    de Bézier, da borda que chega até o meio das costas e do meio até a borda que sai."""
    p0, p3 = costas(chega[-1]), costas(sai[0])
    d0 = (p0 - costas(chega[-40])).normalized()
    d3 = (costas(sai[39]) - p3).normalized()
    # linha do meio da costura: da fenda 1 (na lateral esquerda do boneco) para a fenda 2
    e1 = costas(dir_logo(*SAI_A1)).lerp(costas(dir_logo(*SAI_B1)), 0.5)
    e2 = costas(dir_logo(*SAI_A2)).lerp(costas(dir_logo(*SAI_B2)), 0.5)
    eixo = (e2 - e1).normalized()
    cima = Vector((-eixo.y, eixo.x))
    if cima.y < 0:
        cima = -cima
    meio = (e1 + e2) / 2 + cima * lado * math.tan(COSTURA / 2) / 2
    dm = eixo if (p3 - p0).dot(eixo) > 0 else -eixo
    # Na logo, a lâmina faz quina onde o arco encontra a borda; aqui a quina é suave: a borda segue
    # o rumo de dentro da logo, mas no máximo VIRADA longe do rumo do meio. Sem isso a fenda 2, que
    # já sai aberta da logo, inchava numa boca preta do lado direito.
    d0 = limitar(d0, (meio - p0).normalized())
    d3 = limitar(d3, (p3 - meio).normalized())
    h0, h1 = (meio - p0).length * ALCA, (p3 - meio).length * ALCA
    pts = bezier(p0, p0 + d0 * h0, meio - dm * h0, meio, n) + bezier(meio, meio + dm * h1, p3 - d3 * h1, p3, n)[1:]
    return [das_costas(p) for p in pts]


def reamostrar(pts, passo, normalizar=True):
    """Pontos igualmente espaçados ao longo de uma linha densa (direções na esfera, ou pontos com
    normalizar=False). As contas vão em numpy: o mathutils guarda em 32 bits, e o ângulo entre
    duas amostras vizinhas (~1e-4) some no arredondamento."""
    p = np.array([tuple(v) for v in pts], dtype=np.float64)
    acum = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    n = max(1, round(acum[-1] / passo))
    alvo = np.linspace(0, acum[-1], n + 1)
    q = np.stack([np.interp(alvo, acum, p[:, c]) for c in range(p.shape[1])], axis=1)
    if normalizar:
        q /= np.linalg.norm(q, axis=1)[:, None]
    return [Vector(v) for v in q]


def laco(pecas, passo):
    pts = []
    for p in pecas:
        q = reamostrar(p, passo)
        pts += q if not pts else q[1:]
    return pts[:-1]  # o último repete o primeiro


# a borda de cada lâmina, no mesmo sentido: o preto (órbita do olho, anel e fendas) fica entre as duas
a_ponta, a_anel, a_espiral = arco(A_PONTA, SAI_A2, PONTA_A), arco(ANEL, PONTA_A, TAN_A), arco(A_ESPIRAL, TAN_A, SAI_A1)
b_ponta, b_anel, b_espiral = arco(B_PONTA, SAI_B1, PONTA_B), arco(ANEL, PONTA_B, TAN_B), arco(B_ESPIRAL, TAN_B, SAI_B2)
BORDA_A = laco([a_ponta, a_anel, a_espiral, costura(a_espiral, a_ponta, 1)], PASSO_BORDA)
BORDA_B = laco([b_ponta, b_anel, b_espiral, costura(b_espiral, b_ponta, -1)], PASSO_BORDA)
# o fundo da órbita fica escondido embaixo da lente: tem um buraco ali, a lente tampa
BURACO = IRIS * 0.88
FURO = laco([[dir_logo(BURACO * math.cos(a), BURACO * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 400)]],
            math.radians(2.5))

# A triangulação é feita num plano: a projeção estereográfica a partir de um ponto embaixo da bola,
# um pouco para trás (no meio da lâmina B, longe de toda borda). Ela conserva os ângulos, então a
# triangulação de Delaunay do plano continua boa na esfera. Em volta daquele ponto, onde o plano
# vai para o infinito, um leque fecha a bola.
LONGE = dir_esf(math.radians(110), math.radians(-90))
LEQUE = math.radians(6)
_giro = LONGE.rotation_difference(Vector((0, 0, 1)))


def plano(d):
    q = _giro @ d
    return Vector((q.x / (1 - q.z), q.y / (1 - q.z)))


def passo(th):
    t = min(1.0, max(0.0, (th - math.radians(80)) / math.radians(50)))
    return PASSO_FRENTE + (PASSO_COSTAS - PASSO_FRENTE) * t


n_leque = max(8, round(2 * math.pi * math.sin(LEQUE) / PASSO_COSTAS))
LEQUE_ANEL = [_giro.inverted() @ Vector((math.sin(LEQUE) * math.cos(a), math.sin(LEQUE) * math.sin(a), math.cos(LEQUE)))
              for a in (2 * math.pi * i / n_leque for i in range(n_leque))]

# pontos soltos em anéis desencontrados (triângulos quase equiláteros), longe das bordas e do leque
soltos = [Vector((0, -1, 0)), Vector((0, 1, 0))]
th, k = passo(0.0), 0
while th < math.pi - passo(th) * 0.6:
    n = max(6, round(2 * math.pi * math.sin(th) / passo(th)))
    soltos += [dir_esf(th, 2 * math.pi * (i + 0.5 * (k % 2)) / n) for i in range(n)]
    th += passo(th) * 0.866
    k += 1
travas = np.array([tuple(d) for d in BORDA_A + BORDA_B + FURO + LEQUE_ANEL])
S = np.array([tuple(d) for d in soltos])
perto = np.arccos(np.clip((S @ travas.T).max(axis=1), -1, 1))
limite = np.array([passo(math.acos(max(-1.0, min(1.0, -d.y)))) * 0.55 for d in soltos])
longe = np.arccos(np.clip(S @ np.array(tuple(LONGE)), -1, 1)) > LEQUE + PASSO_COSTAS * 0.5
soltos = [d for d, a, lim, ok in zip(soltos, perto, limite, longe) if a > lim and ok]
assert min(LONGE.angle(d) for d in BORDA_A + BORDA_B) > LEQUE * 3, 'o leque caiu perto de uma borda'

lacos = [BORDA_A, BORDA_B, FURO, LEQUE_ANEL]
pontos = [d for l in lacos for d in l] + soltos
arestas, ini = [], 0
for l in lacos:
    arestas += [(ini + i, ini + (i + 1) % len(l)) for i in range(len(l))]
    ini += len(l)
n_bordas = len(BORDA_A) + len(BORDA_B)  # as primeiras arestas são as bordas das lâminas
pv, pa, pf, ov, oa, _ = delaunay_2d_cdt([plano(d) for d in pontos], arestas, [], 0, 1e-9)


def dentro(px, py, poli):
    """Ponto dentro do polígono (paridade), para todos os pontos de uma vez."""
    x0, y0 = poli[:, 0], poli[:, 1]
    x1, y1 = np.roll(x0, -1), np.roll(y0, -1)
    res = np.zeros(len(px), bool)
    for i in range(len(poli)):
        cruza = (y0[i] > py) != (y1[i] > py)
        xc = (x1[i] - x0[i]) * (py - y0[i]) / ((y1[i] - y0[i]) or 1e-30) + x0[i]
        res ^= cruza & (px < xc)
    return res


def no_plano(l):
    return np.array([tuple(plano(d)) for d in l])


P2 = np.array([(v.x, v.y) for v in pv])
TRI = [tuple(f) for f in pf]
cen = P2[np.array(TRI)].mean(axis=1)
# preto é o que fica dentro de uma borda só: dentro das duas é a lâmina A (no plano, a B é que dá
# a volta pelo infinito)
na_fenda = dentro(cen[:, 0], cen[:, 1], no_plano(BORDA_A)) ^ dentro(cen[:, 0], cen[:, 1], no_plano(BORDA_B))
no_buraco = dentro(cen[:, 0], cen[:, 1], no_plano(FURO))
borda_fenda = [tuple(pa[k]) for k in range(len(pa)) if any(o < n_bordas for o in oa[k])]
_ini_leque = len(pontos) - len(soltos) - len(LEQUE_ANEL)
anel_leque = [next(i for i, o in enumerate(ov) if j in o) for j in range(_ini_leque, _ini_leque + len(LEQUE_ANEL))]
# a casca guarda a direção de cada ponto do plano (os pontos de volta à esfera)
DIRS = [None] * len(pv)
for i, o in enumerate(ov):
    DIRS[i] = pontos[o[0]] if o else None
assert all(d is not None for d in DIRS), 'a triangulação criou um ponto novo'


# ------------------------------------------------------------------ materiais

def material(nome, cor, rugosidade, verniz=0.0, brilho=None, forca=0.0, veludo=0.0, usar_cor_vertice=False):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    m.use_backface_culling = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*cor, 1)
    bsdf.inputs['Roughness'].default_value = rugosidade
    bsdf.inputs['Coat Weight'].default_value = verniz
    bsdf.inputs['Coat Roughness'].default_value = 0.06
    if veludo:
        # o veludo clareia a borda contra a luz
        bsdf.inputs['Sheen Weight'].default_value = veludo
        bsdf.inputs['Sheen Roughness'].default_value = 0.35
        bsdf.inputs['Sheen Tint'].default_value = (0.78, 0.9, 1.0, 1)
    if brilho:
        bsdf.inputs['Emission Color'].default_value = (*brilho, 1)
        bsdf.inputs['Emission Strength'].default_value = forca
    if usar_cor_vertice:
        no = m.node_tree.nodes.new('ShaderNodeVertexColor')
        no.layer_name = 'Cor'
        m.node_tree.links.new(no.outputs['Color'], bsdf.inputs['Base Color'])
    return m


def srgb(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def misturar(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# o azul da logo (#0085CB): mais claro na frente e em cima, mais fundo embaixo e atrás
AZUL = srgb((0.0, 0.522, 0.796))
AZUL_CLARO = srgb((0.24, 0.68, 0.95))
AZUL_FUNDO = srgb((0.0, 0.34, 0.6))

MATS = [
    material('Corpo', (1, 1, 1), 0.3, verniz=0.55, brilho=AZUL, forca=0.18, veludo=0.6, usar_cor_vertice=True),
    material('Preto', (0.004, 0.005, 0.009), 0.2, verniz=1.0),
    material('Brilho', (1, 1, 1), 0.4, brilho=(1, 1, 1), forca=1.0),
]
CORPO, PRETO, BRILHO = range(3)


def cor_de(n):
    frente = -n.y * 0.7 + n.z * 0.3
    if frente > 0:
        return misturar(AZUL, AZUL_CLARO, frente ** 1.4)
    return misturar(AZUL, AZUL_FUNDO, (-frente) ** 0.9)


# ------------------------------------------------------------------ malha
# Tudo vai para uma malha só (um desenho por material). Cada face diz como é a normal dela:
# ('raio', c) é a de uma esfera de centro c — a casca fica lisa por mais torta que seja a
# triangulação —, 'plana' é a da própria face (paredes das fendas) e None a calculada.

class Malha:
    def __init__(self):
        self.v, self.osso, self.f, self.mat, self.normal = [], [], [], [], []

    def vert(self, co, osso):
        self.v.append(Vector(co))
        self.osso.append(osso)
        return len(self.v) - 1

    def face(self, idx, mat, normal=None, fora=None):
        """fora: para onde a face deve olhar (inverte a ordem se precisar)."""
        idx = list(idx)
        if fora is not None:
            a, b, c = (self.v[i] for i in idx[:3])
            if (b - a).cross(c - a).dot(fora) < 0:
                idx.reverse()
        self.f.append(idx)
        self.mat.append(mat)
        self.normal.append(normal)

    def de_bmesh(self, bm, mat, osso, normal=None):
        base = len(self.v)
        for v in bm.verts:
            self.vert(v.co.copy(), osso)
        bm.verts.index_update()
        for f in bm.faces:
            self.face([base + v.index for v in f.verts], mat, normal)
        bm.free()


M = Malha()
ESFERA = ('raio', CENTRO)

# casca da bola: as lâminas em R, o fundo das fendas em R - FENDA e as paredes entre os dois
D = [ROSTO @ d for d in DIRS]  # direções já no referencial do boneco
topo, fundo = {}, {}


def v_topo(i):
    if i not in topo:
        topo[i] = M.vert(CENTRO + D[i] * R, 'Head')
    return topo[i]


def v_fundo(i):
    if i not in fundo:
        fundo[i] = M.vert(CENTRO + D[i] * (R - FENDA), 'Head')
    return fundo[i]


lado_fenda = {}
for t, fenda, buraco in zip(TRI, na_fenda, no_buraco):
    fora = sum((D[i] for i in t), Vector()) / 3
    if fenda:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            lado_fenda[frozenset((a, b))] = fora
        if not buraco:
            M.face([v_fundo(i) for i in t], PRETO, ESFERA, fora)
    else:
        M.face([v_topo(i) for i in t], CORPO, ESFERA, fora)
for a, b in borda_fenda:
    # a parede olha para dentro da fenda: do meio da aresta para o centro do triângulo preto vizinho
    meio = (D[a] + D[b]) / 2
    M.face([v_topo(a), v_topo(b), v_fundo(b), v_fundo(a)], PRETO, 'plana', lado_fenda[frozenset((a, b))] - meio)
centro_leque = M.vert(CENTRO + ROSTO @ LONGE * R, 'Head')
for i in range(len(anel_leque)):
    a, b = anel_leque[i], anel_leque[(i + 1) % len(anel_leque)]
    M.face([v_topo(a), v_topo(b), centro_leque], CORPO, ESFERA, ROSTO @ LONGE)

# lente: a íris é uma calota estufada, rente às lâminas na borda, encaixada na órbita preta
BOJO = 0.03
# a calota passa pela borda da íris na casca (lateral la, altura h) e pelo topo, BOJO acima da casca
la, h = R * IRIS, R * math.sqrt(1 - IRIS ** 2) - R - BOJO
RL = -(la * la + h * h) / (2 * h)  # raio da calota
LC = CENTRO + FRENTE * (R + BOJO - RL)  # centro dela, no eixo do rosto: é onde o olho gira


def na_lente(x, y, acima=0.0):
    """Ponto da logo (x, y) na superfície da lente, erguido 'acima' na direção da normal dela."""
    lat = Vector((x * R, 0, y * R))
    n = Vector((x * R, -math.sqrt(max(0.0, RL * RL - lat.length_squared)), y * R)) / RL
    return LC + ROSTO @ (n * (RL + acima))


def disco(raio, aneis, gomos, ponto, osso, mat, normal, fora):
    """Disco da logo em anéis (centro + anéis), levado para 3D por ponto(x, y). Devolve o último anel."""
    centro = M.vert(ponto(0.0, 0.0), osso)
    anterior = None
    for j in range(1, aneis + 1):
        r = raio * j / aneis
        anel = [M.vert(ponto(r * math.cos(2 * math.pi * i / gomos), r * math.sin(2 * math.pi * i / gomos)), osso)
                for i in range(gomos)]
        for i in range(gomos):
            i2 = (i + 1) % gomos
            if anterior is None:
                M.face([centro, anel[i], anel[i2]], mat, normal, fora)
            else:
                M.face([anterior[i], anel[i], anel[i2], anterior[i2]], mat, normal, fora)
        anterior = anel
    return anterior


GOMOS_LENTE = 72
disco(IRIS, 10, GOMOS_LENTE, na_lente, 'Eye', CORPO, ('raio', LC), FRENTE)
# saia preta da lente: da borda até abaixo do fundo da órbita, para a fenda ser preta de qualquer ângulo
cima, baixo = [], []
for i in range(GOMOS_LENTE):
    a = 2 * math.pi * i / GOMOS_LENTE
    p = na_lente(IRIS * math.cos(a), IRIS * math.sin(a))
    cima.append(M.vert(p, 'Eye'))
    baixo.append(M.vert(CENTRO + (p - CENTRO).normalized() * (R - FENDA - 0.004), 'Eye'))
for i in range(GOMOS_LENTE):
    i2 = (i + 1) % GOMOS_LENTE
    a = 2 * math.pi * (i + 0.5) / GOMOS_LENTE
    M.face([cima[i], baixo[i], baixo[i2], cima[i2]], PRETO, None, ROSTO @ Vector((math.cos(a), 0, math.sin(a))))


# pupila: uma conta preta e lisa sobre a lente, de borda arredondada, com o brilho no alto
def alt_pupila(r):
    return 0.0025 + 0.007 * math.sqrt(max(0.0, 1 - (r / PUPILA) ** 2))


borda = disco(PUPILA, 7, 48, lambda x, y: na_lente(x, y, alt_pupila(math.hypot(x, y))), 'Pupil', PRETO, None,
              FRENTE)
saia = [M.vert(na_lente(PUPILA * math.cos(2 * math.pi * i / 48), PUPILA * math.sin(2 * math.pi * i / 48), -0.003),
               'Pupil') for i in range(48)]
for i in range(48):
    a = 2 * math.pi * (i + 0.5) / 48
    M.face([borda[i], saia[i], saia[(i + 1) % 48], borda[(i + 1) % 48]], PRETO, None,
           ROSTO @ Vector((math.cos(a), 0, math.sin(a))))


def esfera(raio=1.0, seg=32, aneis=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=aneis, radius=raio)
    return bm


def transformar(bm, m):
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def na_pupila(x, y, sx, sy, sz):
    """Elipsoide deitado sobre a pupila no ponto (x, y) da logo."""
    p = na_lente(x, y, alt_pupila(math.hypot(x, y)))
    n = (p - LC).normalized()
    cima = (CIMA_ROSTO - CIMA_ROSTO.dot(n) * n).normalized()
    lado = cima.cross(n)
    return Matrix.Translation(p) @ Matrix((lado, cima, n)).transposed().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1))


# brilhos: no alto à esquerda de quem olha, e um pontinho embaixo à direita
for (x, y), tam in (((-0.085, 0.09), (0.032, 0.042, 0.006)), ((0.1, -0.085), (0.013, 0.013, 0.004))):
    bm = esfera(1.0, 16, 8)
    transformar(bm, na_pupila(x, y, *tam))
    M.de_bmesh(bm, BRILHO, 'Pupil')

# Curvinha: a ponta que a logo tem embaixo à direita. Na logo é um degrau da espiral: o arco de
# fora da lâmina passa por cima do contorno e acaba numa ponta que sobra para trás do entalhe. Na
# bola ela vira uma escama em relevo sobre a lateral (o contorno visto de frente): nasce rente à
# casca, sobe até a altura do arco da logo e acaba em gancho — a crista chega na ponta e a base
# fica no entalhe, um pouco antes. De frente o contorno é o da logo; de lado ela tem volume.
CURVINHA_LARGURA = math.radians(17)  # quanto a escama avança para a frente e para trás do contorno
# do tamanho exato da logo (10% do raio) ela sumia entre a mão e o pé: aqui sobe o dobro
CURVINHA_ALTURA = 2.0
f_emenda, f_ponta, f_entalhe = (math.atan2(p[1], p[0]) for p in (CURVINHA_EMENDA, CURVINHA_PONTA, CURVINHA_ENTALHE))
GANCHO = f_entalhe - f_ponta  # a base da ponta recua até o entalhe


def raio_curvinha(ph):
    """Distância do centro até o arco de fora da curvinha, na direção ph (1 = contorno da bola)."""
    cx, cy, r = CURVINHA
    b = math.cos(ph) * cx + math.sin(ph) * cy
    return b + math.sqrt(b * b - cx * cx - cy * cy + r * r)


def suave(a, b, t):
    """0 antes de a, 1 depois de b, curva suave no meio."""
    if b == a:
        return 1.0 if t >= b else 0.0
    x = max(0.0, min(1.0, (t - a) / (b - a)))
    return x * x * (3 - 2 * x)


NS, NT = 34, 14
grade_c = []
for i in range(NS + 1):
    t_s = 0.02 + 0.98 * i / NS  # ao longo da escama: da emenda (rente à borda) até a ponta
    ph_s = f_emenda + (f_ponta - f_emenda) * t_s
    alt = R * (raio_curvinha(ph_s) - 1) * CURVINHA_ALTURA
    meia = CURVINHA_LARGURA * math.sqrt(t_s * max(0.0, 1 - t_s ** 4))
    gancho = GANCHO * suave(0.6, 1.0, t_s)
    linha = []
    for j in range(NT + 1):
        u = -1 + 2 * j / NT  # de um lado ao outro da escama
        c = (1 - u * u) ** 0.6  # seção arredondada: a borda encontra a casca de pé
        # a borda fica 3 mm para dentro da casca, e a crista recua com o gancho perto da ponta
        d = dir_esf(math.pi / 2 + meia * u, ph_s + gancho * (1 - c))
        linha.append(M.vert(CENTRO + ROSTO @ d * (R + alt * c - 0.003), 'Head'))
    grade_c.append(linha)
# a grade tem um sentido só: acerta pela face do meio (bem de frente para fora) e vale para todas,
# inclusive as quase de pé perto da ponta, onde "para fora do centro" não decide nada
meio_v = M.v[grade_c[NS // 2][NT // 2]]
a_, b_, c_ = (M.v[k] for k in (grade_c[NS // 2][NT // 2], grade_c[NS // 2 + 1][NT // 2], grade_c[NS // 2 + 1][NT // 2 + 1]))
inverte = (b_ - a_).cross(c_ - a_).dot(meio_v - CENTRO) < 0
for i in range(NS):
    for j in range(NT):
        q = [grade_c[i][j], grade_c[i + 1][j], grade_c[i + 1][j + 1], grade_c[i][j + 1]]
        M.face(q[::-1] if inverte else q, CORPO)

# mãos: gotinhas soltas ao lado do corpo, com a ponta inclinada para dentro, um pouco acima da
# curvinha (mais baixas, a mão esquerda e a escama pareciam um braço só)
MAO = {}
for lado, sx in (('L', 1), ('R', -1)):
    centro = Vector((sx * 0.6, -0.01, CZ - 0.07))
    bm = esfera(1.0, 24, 12)
    for v in bm.verts:
        x, y, z = v.co
        afina = 1 - 0.28 * max(0.0, z) ** 2  # a ponta de cima mais fina: gota
        v.co = Vector((x * 0.078 * afina, y * 0.09 * afina, z * 0.122))
    transformar(bm, Matrix.Rotation(-sx * 0.38, 4, 'Y'))
    transformar(bm, Matrix.Translation(centro))
    MAO[lado] = centro
    M.de_bmesh(bm, CORPO, f'Hand.{lado}')

# pés: dois feijões embaixo da bola, a ponta aparecendo na frente e um pouco para fora. Ficam por
# dentro da ponta da curvinha, para o passo não atravessá-la.
PE_ALT = 0.075
PE = {}
for lado, sx in (('L', 1), ('R', -1)):
    centro = Vector((sx * 0.17, -0.15, 0))
    bm = esfera(1.0, 24, 12)
    for v in bm.verts:
        x, y, z = v.co
        if z < 0:
            z *= 0.7  # sola mais reta
        v.co = Vector((x * 0.11, y * 0.155, z * PE_ALT))
    transformar(bm, Matrix.Rotation(sx * 0.16, 4, 'Z'))
    # a sola achatada fica a PE_ALT * 0,7 abaixo do centro: subindo isso ela encosta em y=0
    centro.z = PE_ALT * 0.7
    transformar(bm, Matrix.Translation(centro))
    PE[lado] = centro
    M.de_bmesh(bm, CORPO, f'Foot.{lado}')


# ------------------------------------------------------------------ a malha no Blender

me = bpy.data.meshes.new('Atos')
me.from_pydata([tuple(v) for v in M.v], [], M.f)
me.update()
for m in MATS:
    me.materials.append(m)
me.polygons.foreach_set('material_index', M.mat)
me.shade_smooth()
corpo = bpy.data.objects.new('Atos', me)
bpy.context.collection.objects.link(corpo)

calculadas = [c.vector.copy() for c in me.corner_normals]
normais = []
for p in me.polygons:
    modo = M.normal[p.index]
    for li in p.loop_indices:
        if modo is None:
            normais.append(calculadas[li])
        elif modo == 'plana':
            normais.append(p.normal.copy())
        else:
            normais.append((me.vertices[me.loops[li].vertex_index].co - modo[1]).normalized())
me.normals_split_custom_set(normais)

# cor de cada vértice do azul pela normal (média dos cantos): o degradê acompanha a luz. O preto e
# o brilho ficam brancos: o exportador manda a cor para todo material da malha, e o three multiplica
soma = [Vector() for _ in me.vertices]
azuis = set()
finais = [c.vector.copy() for c in me.corner_normals]
for p in me.polygons:
    for li in p.loop_indices:
        vi = me.loops[li].vertex_index
        soma[vi] += finais[li]
        if p.material_index == CORPO:
            azuis.add(vi)
attr = me.color_attributes.new('Cor', 'BYTE_COLOR', 'POINT')
for i, n in enumerate(soma):
    attr.data[i].color = (*(cor_de(n.normalized()) if i in azuis else (1, 1, 1)), 1)

for nome in sorted(set(M.osso)):
    corpo.vertex_groups.new(name=nome)
por_osso = {}
for i, nome in enumerate(M.osso):
    por_osso.setdefault(nome, []).append(i)
for nome, idx in por_osso.items():
    corpo.vertex_groups[nome].add(idx, 1.0, 'REPLACE')
print('triângulos', sum(len(f) - 2 for f in M.f), 'vértices', len(M.v))


# ------------------------------------------------------------------ esqueleto

arm_data = bpy.data.armatures.new('Esqueleto')
arm = bpy.data.objects.new('Armature', arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')


def osso(nome, cabeca, pai=None, comp=0.12, direcao=Vector((0, 0, 1))):
    b = arm_data.edit_bones.new(nome)
    b.head = Vector(cabeca)
    b.tail = Vector(cabeca) + direcao * comp
    b.roll = 0
    if pai:
        b.parent = arm_data.edit_bones[pai]
    return b


osso('Root', (0, 0, 0), comp=0.1)
# o quadril fica a ~12 cm da base da bola: sentado, o jogo encosta este osso no assento com folga
osso('Hips', (0, 0, CZ - R + 0.12), 'Root')
# pivô do amassar/esticar na base da bola, para ela amassar contra o chão
osso('Body', (0, 0, CZ - R), 'Hips')
osso('Head', (0, 0, CZ), 'Body', 0.3)
# O olho gira em volta do centro da lente, então a pupila desliza sobre ela sem descolar. Os dois
# ossos apontam para o "cima" do rosto: a pupila pisca achatando na vertical dele, sem descer.
osso('Eye', LC, 'Head', 0.08, CIMA_ROSTO)
osso('Pupil', LC, 'Eye', 0.06, CIMA_ROSTO)
for lado in ('L', 'R'):
    osso(f'Hand.{lado}', MAO[lado], 'Hips', 0.1)
    osso(f'Foot.{lado}', PE[lado], 'Root', 0.08)
bpy.ops.object.mode_set(mode='OBJECT')

corpo.parent = arm
mod = corpo.modifiers.new('Armature', 'ARMATURE')
mod.object = arm

for pb in arm.pose.bones:
    pb.rotation_mode = 'XYZ'


# ------------------------------------------------------------------ animações

TODOS = [b.name for b in arm.pose.bones]
ZERO = (0, 0, 0)
UM = (1, 1, 1)


def onda(t, periodo, fase=0.0):
    return math.sin(2 * math.pi * t / periodo + fase)


def piscar(t, inicio, dur=7):
    """Escala vertical da pupila num piscar: 1 → 0,08 → 1 (ela vira um risco e volta)."""
    if t < inicio or t > inicio + dur:
        return 1.0
    x = (t - inicio) / dur
    return 1 - 0.92 * math.sin(math.pi * x) ** 0.6


def olho(inclina, vira, esc=UM, segue=0.15):
    """Pupila olhando para (inclina: + para baixo, vira: + para a esquerda do boneco), e a lente
    acompanhando um pouco. esc: escala da pupila (x largura, y altura)."""
    return {'Pupil': (ZERO, (inclina, vira, 0), esc), 'Eye': (ZERO, (inclina * segue, vira * segue, 0), UM)}


def criar_acao(nome, quadros, pose_em):
    """pose_em(t) devolve {osso: (loc, rot, esc)} — o que faltar fica na pose de descanso.
    Todos os ossos recebem chave em todo quadro: canal que falta num clipe fica parado no
    último valor que outro clipe escreveu (o pé ficaria no meio do passo ao parar)."""
    acao = bpy.data.actions.new(nome)
    acao.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = acao
    for t in range(quadros + 1):
        pose = pose_em(t)
        for nome_osso in TODOS:
            pb = arm.pose.bones[nome_osso]
            loc, rot, esc = pose.get(nome_osso, ((0, 0, 0), (0, 0, 0), (1, 1, 1)))
            pb.location = loc
            pb.rotation_euler = rot
            pb.scale = esc
            for canal in ('location', 'rotation_euler', 'scale'):
                pb.keyframe_insert(canal, frame=t, group=nome_osso)
    arm.animation_data.action = None
    trilha = arm.animation_data.nla_tracks.new()
    trilha.name = nome
    trilha.strips.new(nome, 0, acao)
    trilha.mute = True
    return acao


def esmagar(k):
    """Amassa (k>0) ou estica (k<0) mantendo o volume mais ou menos igual."""
    return (1 + k * 0.5, 1 - k, 1 + k * 0.5)


# Parado: respira, as mãos flutuam fora de fase, a pupila corre para um lado, para o outro e pisca
def idle(t):
    P = 90
    resp = onda(t, P / 2)
    esq = suave(14, 20, t) - suave(38, 44, t)  # olhada para a esquerda do boneco
    dir_ = suave(62, 68, t) - suave(80, 88, t)  # e para a direita, um pouco para baixo
    return {
        'Body': (ZERO, ZERO, esmagar(-0.022 * resp)),
        'Head': (ZERO, (0.02 * onda(t, P, 1.2), 0.05 * onda(t, P, 0.4), 0.03 * onda(t, P)), UM),
        'Hand.L': ((0, 0.022 * onda(t, P / 2, 0.6), 0.01 * onda(t, P)), (0, 0, 0.08 * onda(t, P / 2, 0.6)), UM),
        'Hand.R': ((0, 0.022 * onda(t, P / 2, 1.4), -0.01 * onda(t, P)), (0, 0, -0.08 * onda(t, P / 2, 1.4)), UM),
        **olho(-0.03 * esq + 0.07 * dir_, 0.24 * esq - 0.2 * dir_, (1, piscar(t, 50), 1)),
    }


def passada(t, P, passo, ergue, quique, inclina, balanco_mao, mao_sobe, amassa, giro_pe):
    fi = 2 * math.pi * t / P
    pose = {}
    for lado, sx, f in (('L', 1, 0.0), ('R', -1, math.pi)):
        s, c = math.sin(fi + f), math.cos(fi + f)
        no_ar = max(0.0, c)  # o pé sobe só enquanto vai para a frente
        pose[f'Foot.{lado}'] = ((0, ergue * no_ar ** 1.5, passo * s), (-giro_pe * no_ar * s - 0.15 * no_ar, 0, 0), UM)
        # a mão vai junto com o pé do outro lado
        pose[f'Hand.{lado}'] = ((sx * 0.01 * abs(s), mao_sobe * (1 - abs(c)) + 0.01, -balanco_mao * s),
                                (balanco_mao * 3.2 * s, 0, sx * 0.12 * abs(s)), UM)
    # quica duas vezes por ciclo: no alto quando um pé passa pelo outro, embaixo no apoio
    alto = abs(math.cos(fi))
    apoio = (1 - alto) ** 2
    pose['Hips'] = ((0.012 * math.sin(fi), quique * alto, 0), (inclina, 0.05 * math.sin(fi), 0.06 * math.sin(fi)), UM)
    pose['Body'] = (ZERO, ZERO, esmagar(amassa * apoio - amassa * 0.45 * alto))
    pose['Head'] = (ZERO, (-inclina * 0.45, -0.04 * math.sin(fi), -0.035 * math.sin(fi)), UM)
    # o olhar fica firme para a frente: a pupila desfaz o balanço da cabeça
    pose.update(olho(inclina * 0.3, 0.04 * math.sin(fi), segue=0))
    return pose


def walk(t):
    return passada(t, 20, passo=0.11, ergue=0.07, quique=0.045, inclina=0.07,
                   balanco_mao=0.08, mao_sobe=0.02, amassa=0.07, giro_pe=0.35)


def run(t):
    pose = passada(t, 18, passo=0.17, ergue=0.13, quique=0.1, inclina=0.24,
                   balanco_mao=0.13, mao_sobe=0.06, amassa=0.13, giro_pe=0.55)
    # correndo, as mãos vão mais perto do corpo e um pouco para trás, e a pupila aperta (foco)
    for lado, sx in (('L', 1), ('R', -1)):
        loc, rot, esc = pose[f'Hand.{lado}']
        pose[f'Hand.{lado}'] = ((loc[0] - sx * 0.03, loc[1] + 0.03, loc[2] - 0.04), rot, esc)
    loc, rot, _ = pose['Pupil']
    pose['Pupil'] = (loc, rot, (0.94, 0.86, 1))
    return pose


# No ar: esticado, mãos para cima, pés encolhidos e a pupila dilatada, olhando para cima
def jump(t):
    P = 40
    o = onda(t, P)
    pose = {
        'Hips': ((0, 0.02 * o, 0), (-0.05, 0, 0), UM),
        'Body': (ZERO, ZERO, esmagar(-0.09 - 0.015 * o)),
        'Head': (ZERO, (-0.08, 0, 0), UM),
    }
    for lado, sx, fase in (('L', 1, 0.0), ('R', -1, 0.7)):
        pose[f'Hand.{lado}'] = ((sx * 0.1, 0.36 + 0.025 * onda(t, P, fase), 0.03),
                                (0, 0, -sx * (0.55 + 0.06 * onda(t, P, fase))), UM)
        pose[f'Foot.{lado}'] = ((sx * -0.02, 0.1 + 0.015 * onda(t, P, fase + 1), 0.02), (0.45, 0, 0), UM)
    pose.update(olho(-0.1, 0, (1.16 + 0.02 * o, 1.2 + 0.02 * o, 1)))
    return pose


# Sentado: assenta o peso (amassa um pouco), pés para a frente balançando, mãos apoiadas
def sit(t):
    P = 90
    resp = onda(t, P / 2)
    pose = {
        'Hips': ((0, -0.015, -0.04), (-0.1, 0, 0), UM),
        'Body': (ZERO, ZERO, esmagar(0.06 - 0.02 * resp)),
        'Head': (ZERO, (0.06, 0.06 * onda(t, P, 0.5), 0.025 * onda(t, P)), UM),
        **olho(0.04, 0.14 * onda(t, P, 0.5), (1, piscar(t, 40), 1)),
    }
    for lado, sx, fase in (('L', 1, 0.0), ('R', -1, math.pi)):
        pose[f'Foot.{lado}'] = ((sx * 0.02, 0.085 + 0.02 * onda(t, P / 2, fase), 0.27),
                                (-0.5 + 0.12 * onda(t, P / 2, fase), 0, 0), UM)
        pose[f'Hand.{lado}'] = ((sx * 0.02, -0.09 + 0.012 * resp, 0.05), (0.2, 0, sx * -0.15), UM)
    return pose


# Aceno (toca uma vez): a mão direita sobe ao lado da cabeça e balança três vezes; a pupila olha
# para ela e aperta num sorriso de olho
def wave(t):
    Q = 46
    sobe = suave(0, 8, t) * (1 - suave(36, Q, t))
    balanca = math.sin((t - 8) * 2 * math.pi / 9) if 8 <= t <= 35 else 0.0
    pulo = math.sin(math.pi * min(1.0, t / 10)) if t < 10 else 0.0
    return {
        'Hips': ((0, 0.04 * pulo, 0), (0, 0, 0.09 * sobe), UM),
        'Body': (ZERO, ZERO, esmagar(-0.05 * pulo + 0.02 * sobe)),
        'Head': (ZERO, (-0.04 * sobe, -0.12 * sobe, 0.05 * sobe), UM),
        'Hand.R': ((0.08 * sobe + 0.04 * balanca * sobe, 0.45 * sobe, 0.08 * sobe),
                   (0, 0, 0.25 * sobe + 0.5 * balanca * sobe), UM),
        'Hand.L': ((0, 0.03 * sobe, 0), (0, 0, 0.1 * sobe), UM),
        **olho(-0.05 * sobe, -0.2 * sobe, (1 + 0.06 * sobe, (1 - 0.4 * sobe) * piscar(t, 37, 6), 1)),
    }


# Soco (toca uma vez): puxa a mão direita para trás, gira o corpo e dispara para a frente; a pupila
# aperta na hora do golpe
def punch(t):
    Q = 22
    arma = suave(0, 6, t) * (1 - suave(6, 8, t))
    soco = suave(6, 9, t) * (1 - suave(14, Q, t))
    return {
        'Hips': ((0, 0, 0.06 * soco), (0.12 * soco - 0.04 * arma, -0.3 * arma + 0.35 * soco, 0), UM),
        'Body': (ZERO, ZERO, esmagar(0.05 * arma - 0.06 * soco)),
        'Head': (ZERO, (-0.08 * soco, 0.1 * arma - 0.2 * soco, 0), UM),
        'Hand.R': ((0.05 * arma + 0.3 * soco, 0.12 * soco + 0.04 * arma, -0.14 * arma + 0.62 * soco),
                   (1.3 * soco, 0.2 * soco, -0.3 * arma + 0.9 * soco), (1 + 0.15 * soco,) * 3),
        'Hand.L': ((-0.02 * soco, 0.04 * soco, -0.08 * soco + 0.05 * arma), (0.3 * arma, 0, 0), UM),
        **olho(0.03 * soco, 0, (1 - 0.1 * soco, 1 - 0.45 * soco, 1)),
    }


ACOES = [('Idle', 90, idle), ('Walk', 20, walk), ('Run', 18, run), ('Jump', 40, jump),
         ('Sit', 90, sit), ('Wave', 46, wave), ('Punch', 22, punch)]
for nome, q, f in ACOES:
    criar_acao(nome, q, f)

# a pose de descanso é a que o jogo mede para escalar: nada de animação ativa na hora de exportar
for pb in arm.pose.bones:
    pb.location, pb.rotation_euler, pb.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
cena.frame_start, cena.frame_end = 0, 90

if SAIDA_BLEND:
    # no .blend a primeira trilha fica tocando, para quem abrir já ver o boneco vivo
    for tr in arm.animation_data.nla_tracks:
        tr.mute = tr.name != 'Idle'
    bpy.ops.wm.save_as_mainfile(filepath=SAIDA_BLEND)
    for tr in arm.animation_data.nla_tracks:
        tr.mute = True

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=SAIDA_GLB,
    export_format='GLB',
    use_selection=False,
    export_yup=True,
    export_apply=False,
    export_skins=True,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_optimize_animation_size=False,
    export_reset_pose_bones=True,
    export_vertex_color='MATERIAL',
    export_materials='EXPORT',
    # o carregador do jogo já tem o decodificador meshopt
    export_meshopt_compression_enable=True,
)
print('OK', SAIDA_GLB)
