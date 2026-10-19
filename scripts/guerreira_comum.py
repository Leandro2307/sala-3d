# Código comum do rig procedural da guerreira: juntas, esqueleto, pesos, poses e renders.
# A personagem está de pé na origem, olhando para -Y, ~1,90 m (salto incluso). A estátua veio
# no meio de um passo de passarela: a perna direita vai à frente e cruza para o lado esquerdo,
# a esquerda fica atrás, na ponta do pé. Por isso as pernas não se separam pelo lado (x) e as
# juntas delas são medidas à mão (JUNTAS). Toda animação parte de uma pose neutra (NEUTRO),
# com as pernas retas e os pés lado a lado, e não da pose da estátua.
import bpy, math, colorsys
import numpy as np
from collections import deque
from mathutils import Vector, Matrix, Euler

GRAU = math.pi / 180

# Juntas medidas na malha (renders ortográficos com grade de 5 cm e o esqueleto por cima).
# x > 0 é o lado esquerdo dela. A coluna fica mais perto das costas, como a de verdade.
JUNTAS = {
    "quadril": (0, -0.075, 0.99), "spine": (0, -0.06, 1.11), "spine1": (0, -0.06, 1.23),
    "spine2": (0, -0.07, 1.35), "pescoco": (0, -0.065, 1.48), "cabeca": (0, -0.06, 1.57),
    "topo": (0, -0.05, 1.80),
    "clavicula_L": (0.05, -0.06, 1.47), "ombro_L": (0.163, -0.045, 1.465),
    "cotovelo_L": (0.214, -0.02, 1.20), "punho_L": (0.249, -0.025, 0.972), "dedos_L": (0.221, -0.021, 0.844),
    "clavicula_R": (-0.05, -0.06, 1.47), "ombro_R": (-0.162, -0.045, 1.465),
    "cotovelo_R": (-0.208, -0.028, 1.20), "punho_R": (-0.258, -0.029, 0.972), "dedos_R": (-0.225, -0.038, 0.85),
    # perna direita: a da frente, que cruza para x > 0
    "coxa_R": (-0.08, -0.10, 0.96), "joelho_R": (-0.01, -0.165, 0.53), "tornozelo_R": (0.035, -0.195, 0.12),
    "planta_R": (0.045, -0.30, 0.03), "ponta_R": (0.05, -0.365, 0.005),
    # perna esquerda: a de trás, joelho quase reto, na ponta do pé
    "coxa_L": (0.08, -0.06, 0.96), "joelho_L": (0.024, 0.066, 0.53), "tornozelo_L": (-0.02, 0.157, 0.135),
    "planta_L": (-0.02, 0.055, 0.035), "ponta_L": (-0.02, 0.008, 0.005),
}


def importar(fbx_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    malha = next(ob for ob in bpy.data.objects if ob.type == "MESH")
    return malha


def vertices_mundo(malha):
    """Posições e normais dos vértices no mundo (arrays N x 3)."""
    me = malha.data
    n = len(me.vertices)
    co = np.zeros(n * 3); me.vertices.foreach_get("co", co)
    no = np.zeros(n * 3); me.vertices.foreach_get("normal", no)
    mw = np.array(malha.matrix_world)
    pts = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    nrm = no.reshape(-1, 3) @ np.linalg.inv(mw[:3, :3])
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
    return pts, nrm


# ---------------- regiões da malha ----------------
# A malha é uma ilha só (cabelo, capa e corpo grudados), então as regiões saem da cor da textura
# e da vizinhança: cabelo = amarelo ligado ao alto da cabeça; capa = azul ou debrum claro ligado
# à barra de trás da capa, sem entrar nas braçadeiras e nas botas (perto dos ossos de braço e canela).

def cor_dos_vertices(malha):
    me = malha.data
    img = next(i for i in bpy.data.images if i.size[0] > 0)
    W, H = img.size
    px = np.array(img.pixels[:]).reshape(H, W, 4)
    uv = np.zeros(len(me.loops) * 2); me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    vi = np.zeros(len(me.loops), dtype=np.int64); me.loops.foreach_get("vertex_index", vi)
    x = np.clip((uv[:, 0] * W).astype(int), 0, W - 1)
    y = np.clip((uv[:, 1] * H).astype(int), 0, H - 1)
    soma = np.zeros((len(me.vertices), 3)); cont = np.zeros(len(me.vertices))
    np.add.at(soma, vi, px[y, x, :3]); np.add.at(cont, vi, 1)
    rgb = soma / np.maximum(cont, 1)[:, None]
    return np.array([colorsys.rgb_to_hsv(*c) for c in rgb])


def vizinhos(malha):
    me = malha.data
    ed = np.zeros(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get("vertices", ed)
    viz = [[] for _ in me.vertices]
    for a, b in ed.reshape(-1, 2):
        viz[a].append(b); viz[b].append(a)
    return viz


def inundar(viz, sementes, pode):
    marca = np.zeros(len(viz), bool)
    marca[sementes] = True
    fila = deque(int(s) for s in sementes)
    while fila:
        a = fila.popleft()
        for b in viz[a]:
            if not marca[b] and pode[b]:
                marca[b] = True
                fila.append(b)
    return marca


def _tubo(pts, a, b, ra, rb, nrm=None, fora=-0.2):
    """Vértices dentro do tubo de a até b (raio ra em a, rb em b). Com nrm, só os que olham para
    fora do eixo (cosseno > fora): dentro do tubo, superfície que olha para o eixo ou de lado é
    outra coisa encostada."""
    a, b = np.array(a, float), np.array(b, float)
    u = b - a
    t = np.clip(((pts - a) @ u) / (u @ u), 0, 1)
    r = pts - (a + t[:, None] * u)
    d = np.linalg.norm(r, axis=1)
    dentro = d < ra + (rb - ra) * t
    if nrm is not None:
        dentro &= (nrm * r).sum(1) > fora * d
    return dentro


def classificar(malha, pts, nrm):
    """Máscaras booleanas por vértice: cabelo, capa e o tubo de cada braço."""
    hsv = cor_dos_vertices(malha)
    viz = vizinhos(malha)
    amarelo = (hsv[:, 0] > 0.06) & (hsv[:, 0] < 0.17) & (hsv[:, 1] > 0.40) & (hsv[:, 2] > 0.40)
    azul = (hsv[:, 0] > 0.52) & (hsv[:, 0] < 0.78) & (hsv[:, 1] > 0.20)
    claro = (hsv[:, 1] < 0.25) & (hsv[:, 2] > 0.55)  # debrum da capa (e pelo das botas)
    pano = azul | claro
    cabelo = inundar(viz, np.where(amarelo & (pts[:, 2] > 1.80))[0], amarelo)
    # Capa: abaixo do cinto, tudo o que não é perna, braço, bacia ou sapato (o forro da capa nem é
    # azul). Perna e bacia são o que fica no tubo delas olhando para fora: o forro encostado olha
    # para dentro. Pano encostado na coxa ou na bacia é capa. A mão é cor de pele: pano colado nela
    # é a capa passando atrás. Braçadeira e bota são pano, mas ficam nos tubos do antebraço e da
    # canela.
    J = JUNTAS
    perna = np.zeros(len(pts), bool)
    braco = {}
    for s in ("_L", "_R"):
        perna |= _tubo(pts, J["coxa" + s], J["joelho" + s], 0.13, 0.09, nrm)
        perna |= _tubo(pts, J["joelho" + s], J["tornozelo" + s], 0.09, 0.065)
        perna |= _tubo(pts, J["tornozelo" + s], J["ponta" + s], 0.07, 0.05)
        # braço e braçadeira são cilindros: a normal aponta para fora do eixo. A capa encosta na
        # braçadeira o antebraço inteiro, mas olha de lado.
        b = _tubo(pts, J["clavicula" + s], J["ombro" + s], 0.07, 0.07)
        b |= _tubo(pts, J["ombro" + s], J["cotovelo" + s], 0.07, 0.065, nrm, 0.3)
        b |= _tubo(pts, J["cotovelo" + s], J["punho" + s], 0.065, 0.065, nrm, 0.45) & (pts[:, 2] > J["punho" + s][2] - 0.015)
        # mão: do punho até depois da ponta dos dedos (o osso acaba no meio deles)
        p0, p1 = np.array(J["punho" + s]), np.array(J["dedos" + s])
        b |= _tubo(pts, p0, p1 + 0.5 * (p1 - p0), 0.06, 0.06) & ~pano
        braco[s] = b & ~cabelo
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    centro = np.array((0, -0.06, 0.98))
    bacia = (x / 0.19) ** 2 + ((y + 0.06) / 0.17) ** 2 + ((z - 0.98) / 0.15) ** 2 < 1
    bacia &= (nrm * (pts - centro)).sum(1) > -0.2 * np.linalg.norm(pts - centro, axis=1)
    sapato = (z < 0.27) & (np.abs(x) < 0.18)
    calcinha = (y < -0.06) & (np.abs(x) < 0.16) & (z > 0.85)
    corpo = (perna | bacia) & ~pano
    capa = (z < 1.16) & ((z < 1.10) | pano) & ~cabelo & ~braco["_L"] & ~braco["_R"] & ~sapato & ~calcinha & ~corpo
    # bota: pano no tubo da canela
    for s in ("_L", "_R"):
        capa &= ~_tubo(pts, J["joelho" + s], J["tornozelo" + s], 0.09, 0.065)
    return cabelo, capa, braco


def detectar_seios(pts, corpo):
    """Ponta de cada seio: os vértices mais à frente do peito, de cada lado."""
    res = {}
    for lado, sinal in (("L", 1), ("R", -1)):
        sel = corpo & (pts[:, 2] > 1.36) & (pts[:, 2] < 1.60) & (sinal * pts[:, 0] > 0.02) & (sinal * pts[:, 0] < 0.17)
        q = pts[sel]
        frente = q[:, 1].min()
        res[lado] = Vector(q[q[:, 1] < frente + 0.012].mean(0))
    return res


# ---------------- esqueleto ----------------

def construir_armadura(seios):
    """Cria o esqueleto na pose da estátua (é a pose em que a malha está). Devolve o objeto."""
    J = {k: Vector(v) for k, v in JUNTAS.items()}
    spec = [
        ("Hips", None, J["quadril"], J["spine"]),
        ("Spine", "Hips", J["spine"], J["spine1"]),
        ("Spine1", "Spine", J["spine1"], J["spine2"]),
        ("Spine2", "Spine1", J["spine2"], J["pescoco"]),
        ("Neck", "Spine2", J["pescoco"], J["cabeca"]),
        ("Head", "Neck", J["cabeca"], J["topo"]),
    ]
    for lado in ("_L", "_R"):
        ponta = seios[lado[1]]
        # da parede do peito até a ponta: a mola gira em torno da base, e a ponta sobe e desce
        base = Vector((ponta.x * 0.75, ponta.y + 0.10, ponta.z + 0.012))
        spec += [
            ("Breast" + lado, "Spine2", base, ponta),
            ("Shoulder" + lado, "Spine2", J["clavicula" + lado], J["ombro" + lado]),
            ("UpperArm" + lado, "Shoulder" + lado, J["ombro" + lado], J["cotovelo" + lado]),
            ("LowerArm" + lado, "UpperArm" + lado, J["cotovelo" + lado], J["punho" + lado]),
            ("Hand" + lado, "LowerArm" + lado, J["punho" + lado], J["dedos" + lado]),
            ("UpperLeg" + lado, "Hips", J["coxa" + lado], J["joelho" + lado]),
            ("LowerLeg" + lado, "UpperLeg" + lado, J["joelho" + lado], J["tornozelo" + lado]),
            ("Foot" + lado, "LowerLeg" + lado, J["tornozelo" + lado], J["planta" + lado]),
            ("Toe" + lado, "Foot" + lado, J["planta" + lado], J["ponta" + lado]),
        ]
    for lado, s in (("_L", 1), ("_R", -1)):
        # capa: gira perto da junta da coxa, para acompanhar o passo sem atravessar a perna
        spec.append(("Cape" + lado, "Hips", Vector((s * 0.08, -0.07, 0.97)), Vector((s * 0.16, 0.12, 0.35))))

    dados = bpy.data.armatures.new("Armadura")
    ob = bpy.data.objects.new("Armadura", dados)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    for nome, pai, cab, rab in spec:
        eb = dados.edit_bones.new(nome)
        eb.head = cab
        eb.tail = rab
        if pai:
            eb.parent = dados.edit_bones[pai]
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


# ---------------- pesos ----------------
# Os pesos automáticos do Blender (calor) não servem aqui: os braços quase encostam no tronco,
# as pernas se cruzam e a capa encosta nas mãos. Então cada vértice do corpo vai para os ossos
# mais perto dele, com duas correções: um osso não pega a superfície que olha para ele (o flanco
# do tronco olha para o braço, mas é do tronco) nem o que fica antes da cabeça dele (a cintura
# fica acima da coxa, mas é do quadril). Cabelo e capa têm regra própria.

PENALIDADE_ANTES = {"UpperLeg": 3.0, "UpperArm": 2.0, "Shoulder": 1.5}
# só pega vértice nesta faixa: (eixo, mínimo, máximo); eixo "ax" = |x|
LIMITES = {
    "UpperLeg": ("z", -1, 1.06), "LowerLeg": ("z", -1, 0.75), "Foot": ("z", -1, 0.30), "Toe": ("z", -1, 0.12),
    "UpperArm": ("ax", 0.10, 1), "LowerArm": ("ax", 0.12, 1), "Hand": ("ax", 0.14, 1),
    "Head": ("z", 1.50, 9), "Neck": ("z", 1.38, 9), "Hips": ("z", -1, 1.22), "Spine": ("z", 0.95, 1.36),
}


def _suavizar(W, viz, quais, vezes=3):
    for _ in range(vezes):
        media = np.array([W[v].mean(0) if len(v) else W[i] for i, v in enumerate(viz)])
        W[quais] = 0.5 * W[quais] + 0.5 * media[quais]
    return W


REGIAO_DO_OSSO = {"UpperArm": "braco", "LowerArm": "antebraco", "Hand": "antebraco",
                  "UpperLeg": "coxa", "LowerLeg": "canela", "Foot": "canela", "Toe": "canela"}
# vizinhanças de verdade (o resto é encosto da estátua): o braço só se liga ao tronco no ombro e na
# axila (o cotovelo encosta na cintura), o antebraço no braço, a coxa na bacia e na outra coxa, a
# canela no joelho, cabelo e capa no corpo
OMBRO_Z = 1.34
LIGA = {("ombro", "corpo"), ("ombro", "braco"), ("braco", "antebraco"), ("coxa", "corpo"),
        ("coxa", "coxa"), ("canela", "coxa"), ("capa", "corpo"), ("cabelo", "corpo")}


def _regioes(W, nomes, cabelo, capa, pts):
    dom = W.argmax(1)
    reg = np.array(["corpo"] * len(W), dtype=object)
    for k, n in enumerate(nomes):
        r = REGIAO_DO_OSSO.get(n.split("_")[0])
        if r:
            reg[dom == k] = r + n[-2:]
            if r == "braco":
                reg[(dom == k) & (pts[:, 2] > OMBRO_Z)] = "ombro" + n[-2:]
    reg[cabelo] = "cabelo"
    reg[capa] = "capa"
    return reg


def _ponte(a, b):
    """Aresta entre regiões que se movem separadas (ver LIGA)."""
    if a == b:
        return False
    ta, tb = a.split("_")[0], b.split("_")[0]
    # membro só se liga ao do mesmo lado (as coxas se ligam entre si: virilha)
    if a[-2:] in ("_L", "_R") and b[-2:] in ("_L", "_R") and a[-2:] != b[-2:] and (ta, tb) != ("coxa", "coxa"):
        return True
    return (ta, tb) not in LIGA and (tb, ta) not in LIGA


def pesar(malha, arm, pts, nrm, cabelo, capa, braco, seios):
    nomes = [b.name for b in arm.data.bones]
    idx = {n: i for i, n in enumerate(nomes)}
    N = len(pts)
    W = np.zeros((N, len(nomes)))
    corpo = ~cabelo & ~capa

    # corpo: ossos mais perto, com as correções
    D = np.full((N, len(nomes)), np.inf)
    for b in arm.data.bones:
        if b.name.startswith(("Breast", "Cape")):
            continue
        h, t = np.array(b.head_local), np.array(b.tail_local)
        u = t - h
        L = np.linalg.norm(u)
        u /= L
        s = (pts - h) @ u
        r = pts - (h + np.clip(s, 0, L)[:, None] * u)
        d = np.linalg.norm(r, axis=1) + 1e-6
        olha = (nrm * r).sum(1) / d
        tipo = b.name.split("_")[0]
        de = d * (1 + 2.5 * np.maximum(0, -olha)) + PENALIDADE_ANTES.get(tipo, 1.0) * np.maximum(0, -s)
        lim = LIMITES.get(tipo)
        if lim:
            eixo, lo, hi = lim
            v = np.abs(pts[:, 0]) if eixo == "ax" else pts[:, 2]
            de = np.where((v >= lo) & (v <= hi), de, np.inf)
        # braço e perna de um lado não pegam o outro lado do tronco (as pernas cruzam: só a coxa)
        lado = 1 if b.name.endswith("_L") else -1 if b.name.endswith("_R") else 0
        if lado and tipo == "Shoulder":
            de = np.where(lado * pts[:, 0] > 0.02, de, np.inf)
        if tipo in ("UpperArm", "LowerArm", "Hand"):  # só dentro do tubo do braço
            de = np.where(braco[b.name[-2:]], de, np.inf)
        elif tipo in ("Shoulder", "Spine2"):  # no braço, só perto do ombro
            de = np.where(braco["_L"] | braco["_R"], np.where(pts[:, 2] > 1.36, de, np.inf), de)
        else:  # e o tubo do braço não é de mais ninguém
            de = np.where(braco["_L"] | braco["_R"], np.inf, de)
        if lado and tipo == "UpperLeg":
            de = np.where((pts[:, 2] < 0.85) | (lado * pts[:, 0] > -0.02), de, np.inf)
        D[:, idx[b.name]] = de
    Wc = np.where(np.isfinite(D), np.power(np.minimum(D, 10), -6.0), 0)
    W[corpo] = Wc[corpo]

    # cabelo: cabeça em cima, peito (Spine2) e costas (Spine1) embaixo
    z = pts[:, 2]
    def passo(a, b, x):
        k = np.clip((x - a) / (b - a), 0, 1)
        return k * k * (3 - 2 * k)
    cab = passo(1.42, 1.66, z)
    peito = (1 - cab) * passo(1.22, 1.38, z)
    W[cabelo, idx["Head"]] = cab[cabelo]
    W[cabelo, idx["Spine2"]] = peito[cabelo]
    W[cabelo, idx["Spine1"]] = (1 - cab - peito)[cabelo]

    # capa: presa no quadril em cima; da cintura para baixo passa para o osso de capa do lado
    # (Cape_L/R), que as animações giram (ver Rig.calcular)
    desce = passo(1.08, 0.70, z)
    lado_e = np.clip(0.5 + pts[:, 0] / 0.24, 0, 1)
    W[capa, idx["Hips"]] = (1 - desce)[capa]
    W[capa, idx["Cape_L"]] = (desce * lado_e)[capa]
    W[capa, idx["Cape_R"]] = (desce * (1 - lado_e))[capa]

    W /= W.sum(1, keepdims=True) + 1e-12
    # A malha é uma ilha só: a braçadeira encosta na borda da capa, o salto na barra, uma mecha
    # no braço. Faces que ligam regiões que se movem separadas (braço ou canela com capa, cabelo
    # ou outro membro) esticariam numa teia; elas saem, e a suavização não atravessa a fronteira.
    regiao = _regioes(W, nomes, cabelo, capa, pts)
    viz = vizinhos(malha)
    viz = [[b for b in v if not _ponte(regiao[a], regiao[b])] for a, v in enumerate(viz)]
    W = _suavizar(W, viz, np.where(corpo)[0])
    # fica com os 4 maiores
    corte = np.sort(W, axis=1)[:, -4][:, None]
    W = np.where((W >= corte) & (W > 0.01), W, 0)
    W /= W.sum(1, keepdims=True) + 1e-12

    # seios: peso que cai com a distância da ponta, tirado dos outros ossos do vértice
    RAIO = 0.10
    for lado in ("L", "R"):
        d = np.linalg.norm(pts - np.array(seios[lado]), axis=1)
        sinal = 1 if lado == "L" else -1
        fora_braco = ~braco["_L"] & ~braco["_R"]
        w = np.where(corpo & fora_braco & (d < RAIO) & (sinal * pts[:, 0] > 0.01), (1 - (d / RAIO) ** 2) ** 2 * 0.9, 0)
        W *= (1 - w)[:, None]
        W[:, idx["Breast_" + lado]] += w

    import bmesh
    bm = bmesh.new()
    bm.from_mesh(malha.data)
    pontes = [f for f in bm.faces if any(_ponte(regiao[e.verts[0].index], regiao[e.verts[1].index]) for e in f.edges)]
    bmesh.ops.delete(bm, geom=pontes, context='FACES_ONLY')

    # Na estátua a capa atravessa a braçadeira e a mão (e o cotovelo entra na cintura). O que ficou
    # entalado ali vira, depois do corte, uma ilha pequena que ficaria solta no ar quando o braço
    # sai: ilha pequena colada num membro sai.
    bm.faces.ensure_lookup_table()
    ilhas, visto = [], set()
    for f in bm.faces:
        if f.index in visto:
            continue
        pilha, comp = [f], []
        visto.add(f.index)
        while pilha:
            a = pilha.pop()
            comp.append(a)
            for e in a.edges:
                for g in e.link_faces:
                    if g.index not in visto:
                        visto.add(g.index)
                        pilha.append(g)
        ilhas.append(comp)
    ilhas.sort(key=len, reverse=True)
    membro = np.array([r.split("_")[0] in ("ombro", "braco", "antebraco", "coxa", "canela") for r in regiao])
    grande = np.zeros(N, bool)
    for il in ilhas:
        if len(il) >= 150:
            grande[[v.index for f in il for v in f.verts]] = True
    alvos = pts[grande & membro]
    lixo = []
    for il in ilhas:
        if len(il) >= 150:
            continue
        c = np.mean([pts[v.index] for f in il for v in f.verts], axis=0)
        if np.linalg.norm(alvos - c, axis=1).min() < 0.08:
            lixo.extend(il)
    bmesh.ops.delete(bm, geom=lixo, context='FACES_ONLY')

    # A capa que ficava escondida dentro da braçadeira tem a braçadeira pintada por cima: essas
    # faces ganham a cor chapada da capa (todos os cantos no mesmo ponto do UV, sem costura)
    J = JUNTAS
    escondida = np.zeros(N, bool)
    for s in ("_L", "_R"):
        p0, p1 = np.array(J["punho" + s]), np.array(J["dedos" + s])
        escondida |= _tubo(pts, J["cotovelo" + s], J["punho" + s], 0.075, 0.075)
        escondida |= _tubo(pts, p0, p1 + 0.5 * (p1 - p0), 0.065, 0.065)
    escondida &= regiao == "capa"
    uv = bm.loops.layers.uv.active
    # azul da capa: um canto no meio das costas, longe de debrum e de qualquer membro
    meio = np.array((0, 0.25, 0.6))
    azul_uv = None
    melhor = 9
    for f in bm.faces:
        for l in f.loops:
            d = np.linalg.norm(pts[l.vert.index] - meio)
            if regiao[l.vert.index] == "capa" and d < melhor:
                melhor, azul_uv = d, l[uv].uv.copy()
    repintadas = 0
    for f in bm.faces:
        if all(escondida[v.index] for v in f.verts):
            for l in f.loops:
                l[uv].uv = azul_uv
            repintadas += 1

    # buracos pequenos do corte são tapados, com a cor chapada de um vizinho; contorno que mistura
    # regiões que se separam fica aberto
    bm.edges.ensure_lookup_table()
    borda = [e for e in bm.edges if len(e.link_faces) == 1]
    viz_b = {}
    for e in borda:
        for v in e.verts:
            viz_b.setdefault(v.index, []).append(e)
    usado, tapar = set(), []
    for e in borda:
        if e.index in usado:
            continue
        laco, v, atual = [], e.verts[0], e
        while atual is not None and atual.index not in usado:
            usado.add(atual.index)
            laco.append(atual)
            v = atual.other_vert(v)
            prox = [x for x in viz_b[v.index] if x.index not in usado]
            atual = prox[0] if prox else None
        regs = {regiao[v.index] for x in laco for v in x.verts}
        if len(laco) <= 40 and not any(_ponte(a, b) for a in regs for b in regs):
            tapar.extend(laco)
    novas = bmesh.ops.holes_fill(bm, edges=tapar, sides=40)["faces"]
    for f in novas:
        vizinho = next((l2 for l in f.loops for l2 in l.vert.link_loops if l2.face is not f), None)
        if vizinho:
            for l in f.loops:
                l[uv].uv = vizinho[uv].uv
    soltas = [e for e in bm.edges if not e.link_faces]
    bmesh.ops.delete(bm, geom=soltas, context='EDGES_FACES')
    bm.to_mesh(malha.data)
    bm.free()
    print("PONTES", len(pontes), "faces cortadas,", len(lixo), "faces de entalhe apagadas,",
          repintadas, "repintadas,", len(novas), "remendos")

    for n in nomes:
        malha.vertex_groups.new(name=n)
    grupos = malha.vertex_groups
    for vi in range(N):
        for k in np.nonzero(W[vi])[0]:
            grupos[int(k)].add([vi], float(W[vi, k]), "REPLACE")
    mod = malha.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    malha.parent = arm
    return W


# ---------------- pose neutra e cálculo das poses ----------------
# Convenção de todos os giros (graus, eixos do mundo na pose neutra; o filho herda o giro do pai):
#   X: osso que aponta para baixo (perna, braço) vai para TRÁS com +X e para a frente com -X;
#      osso que aponta para cima (coluna, pescoço, cabeça) inclina para a FRENTE com +X.
#      Logo: coxa à frente = -X, dobrar o joelho = +X, dobrar o cotovelo = -X, pé de ponta = +X.
#   Y: osso que aponta para baixo vai para a direita dela (-x) com +Y: abrir o braço/perna
#      esquerdo = -Y, direito = +Y. Na coluna, +Y inclina para a esquerda dela; no quadril, +Y
#      baixa o lado esquerdo.
#   Z: gira em torno da vertical; +Z vira a frente para a esquerda dela.

def rot(*giros):
    """Giros em sequência, eixos fixos: rot(("Z", -90), ("Y", 100)) = Z primeiro, depois Y."""
    m = Matrix.Identity(3)
    for eixo, g in giros:
        m = Matrix.Rotation(g * GRAU, 3, eixo) @ m
    return m


def _espelho(v):
    return Vector((-v.x, v.y, v.z))


class Rig:
    """Pose neutra (pernas retas, pés lado a lado) e conversão de poses em matrix_basis."""

    def __init__(self, arm_ob):
        bones = arm_ob.data.bones
        self.ordem, fila = [], [b for b in bones if not b.parent]
        while fila:
            b = fila.pop(0)
            self.ordem.append(b.name)
            fila.extend(b.children)
        self.pai = {b.name: b.parent.name if b.parent else None for b in bones}
        self.rest = {b.name: b.matrix_local.copy() for b in bones}
        self.cab = {b.name: b.head_local.copy() for b in bones}
        self.dir = {b.name: (b.tail_local - b.head_local).normalized() for b in bones}
        self.comp = {b.name: (b.tail_local - b.head_local).length for b in bones}

        # alvos da pose neutra: direção de cada osso da perna; o pé direito (o da frente, apoiado
        # no salto) fica como está, e o esquerdo copia ele espelhado
        alvo = {}
        for lado, s in (("_L", 1), ("_R", -1)):
            q = self.cab["UpperLeg" + lado]
            joelho = Vector((s * 0.072, -0.09, q.z - self.comp["UpperLeg" + lado]))
            alvo["UpperLeg" + lado] = (joelho - q).normalized()
            alvo["LowerLeg" + lado] = Vector((0, 0.01, -1)).normalized()
        alvo["Foot_R"] = "repouso"
        alvo["Toe_R"] = "repouso"
        alvo["Foot_L"] = _espelho(self.dir["Foot_R"])
        alvo["Toe_L"] = _espelho(self.dir["Toe_R"])

        self._perna = {}
        self.Rn, self.ncab = {}, {}
        for n in self.ordem:
            p = self.pai[n]
            Rp = self.Rn[p] if p else Matrix.Identity(3)
            self.ncab[n] = self.cab[n] if not p else self.ncab[p] + self.Rn[p] @ (self.cab[n] - self.cab[p])
            a = alvo.get(n)
            if a == "repouso":
                self.Rn[n] = Matrix.Identity(3)
            elif a is not None:
                self.Rn[n] = (Rp @ self.dir[n]).rotation_difference(a).to_matrix() @ Rp
            else:
                self.Rn[n] = Rp.copy()

        # pontos do solado (salto e ponta), relativos ao osso na pose neutra (ver medir_solado)
        self.solado = {}
        self.base_z = 0.0

    def medir_solado(self, pts):
        """Salto e ponta do sapato direito (o que está no chão na estátua)."""
        tz = self.cab["Foot_R"]
        pe = pts[(pts[:, 2] < 0.14) & (pts[:, 1] < -0.13) & (pts[:, 0] > -0.03) & (pts[:, 0] < 0.13)]
        salto = pe[pe[:, 1] > tz.y + 0.01]
        salto = Vector(salto[salto[:, 2].argmin()])
        frente = pe[pe[:, 1] < pe[:, 1].min() + 0.08]
        ponta = Vector(frente[frente[:, 2].argmin()])
        for n, p in (("Foot_R", salto), ("Toe_R", ponta)):
            off = self.Rn[n] @ (p - self.cab[n])
            self.solado[n] = [off]
            self.solado[n.replace("_R", "_L")] = [_espelho(off)]
        # na neutra as pernas ficam retas e verticais, mais compridas na vertical que na estátua
        # (lá elas cruzam em diagonal): base_z sobe o quadril até o salto tocar o chão de novo
        chao = min((self.ncab[n] + o).z for n in ("Foot_R", "Toe_R") for o in self.solado[n])
        self.base_z = -chao

    def calcular(self, pose, ik=None):
        """pose: {osso: Matrix 3x3 ou (euler_graus, delta_loc)}; ik: {"_L"/"_R": dict} (ver _ik).
        Devolve {osso: matrix_basis}."""
        W, cab = {}, {}
        for n in self.ordem:
            if n.startswith("Cape"):
                continue
            item = pose.get(n)
            dl = None
            if isinstance(item, tuple):
                eu, dl = item
                D = Euler(tuple(g * GRAU for g in eu), "XYZ").to_matrix() if eu else Matrix.Identity(3)
            elif item is not None:
                D = item
            else:
                D = Matrix.Identity(3)
            p = self.pai[n]
            if p is None:
                W[n] = D
                cab[n] = self.ncab[n] + Vector((0, 0, self.base_z)) + (Vector(dl) if dl else Vector())
            else:
                if ik and n.startswith(("UpperLeg", "LowerLeg", "Foot", "Toe")) and n[-2:] in ik:
                    W[n] = self._ik(n, W, cab, ik[n[-2:]])
                else:
                    W[n] = W[p] @ D
                cab[n] = cab[p] + W[p] @ (self.ncab[n] - self.ncab[p])

        # capa: se a pose não diz, acompanha 40% do quanto a coxa do lado vai para a frente ou para
        # trás (em relação ao quadril), sem passar de 12° à frente nem 20° atrás
        for n in self.ordem:
            if not n.startswith("Cape"):
                continue
            p = self.pai[n]
            item = pose.get(n)
            if item is None:
                coxa = "UpperLeg" + n[-2:]
                d0 = self.Rn[coxa] @ self.dir[coxa]
                d = W[p].transposed() @ W[coxa] @ d0
                giro = math.degrees(math.atan2(d.y, -d.z) - math.atan2(d0.y, -d0.z))
                item = ((min(20.0, max(-12.0, 0.4 * giro)), 0, 0), None)
            D = item if not isinstance(item, tuple) else Euler(tuple(g * GRAU for g in item[0]), "XYZ").to_matrix()
            W[n] = W[p] @ D
            cab[n] = cab[p] + W[p] @ (self.ncab[n] - self.ncab[p])

        basis, P = {}, {}
        for n in self.ordem:
            Rf = (W[n] @ self.Rn[n]).to_4x4()
            P[n] = Matrix.Translation(cab[n]) @ Rf @ Matrix.Translation(-self.cab[n]) @ self.rest[n]
            p = self.pai[n]
            if p is None:
                basis[n] = self.rest[n].inverted() @ P[n]
            else:
                basis[n] = (P[p] @ self.rest[p].inverted() @ self.rest[n]).inverted() @ P[n]
        self.ultimo = (W, cab)
        return basis

    def _ik(self, n, W, cab, alvo):
        """Perna por IK de dois ossos. alvo: pe=(dx, dy, altura do solado), pitch (graus, + = salto
        sobe), dedos (graus, - = dedos dobram para cima), giro (graus em Z do pé)."""
        lado = n[-2:]
        coxa, canela, pe = "UpperLeg" + lado, "LowerLeg" + lado, "Foot" + lado
        if n == coxa:
            # resolve a perna inteira de uma vez e guarda para canela, pé e dedos
            dx, dy, h = alvo.get("pe", (0, 0, 0))
            Wpe = rot(("X", alvo.get("pitch", 0)), ("Z", alvo.get("giro", 0)))
            Wdedo = Wpe @ rot(("X", alvo.get("dedos", 0)))
            # tornozelo: o ponto mais baixo do solado fica na altura h
            b = self.ncab[pe] + Vector((dx, dy, 0))
            toe = "Toe" + lado
            sola = [Wpe @ o for o in self.solado[pe]]
            ponta_toe = Wpe @ (self.ncab[toe] - self.ncab[pe]) + Wdedo @ self.solado[toe][0]
            menor = min([p.z for p in sola] + [ponta_toe.z])
            A = Vector((b.x, b.y, h - menor))
            H = cab[self.pai[coxa]] + W[self.pai[coxa]] @ (self.ncab[coxa] - self.ncab[self.pai[coxa]])
            L1, L2 = self.comp[coxa], self.comp[canela]
            v = A - H
            d = min(v.length, (L1 + L2) * 0.9995)
            u = v.normalized()
            a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
            hh = math.sqrt(max(0.0, L1 * L1 - a * a))
            frente = W[self.pai[coxa]] @ Vector((0, -1, 0))
            if "joelho" in alvo:  # joelho para fora/dentro
                frente = rot(("Z", alvo["joelho"])) @ frente
            polo = (frente - u * frente.dot(u)).normalized()
            K = H + u * a + polo * hh
            A = H + u * d
            dc, dn = (K - H).normalized(), (A - K).normalized()
            eixo = dc.cross(dn)
            eixo = eixo.normalized() if eixo.length > 1e-4 else (W[self.pai[coxa]] @ Vector((1, 0, 0)))
            perna = self._perna[lado] = {}
            for osso, dnova in ((coxa, dc), (canela, dn)):
                d0 = self.Rn[osso] @ self.dir[osso]
                x0 = Vector((1, 0, 0)); x0 = (x0 - d0 * x0.dot(d0)).normalized()
                ex = (eixo - dnova * eixo.dot(dnova)).normalized()
                M0 = Matrix((x0, d0, x0.cross(d0))).transposed()
                M1 = Matrix((ex, dnova, ex.cross(dnova))).transposed()
                perna[osso] = M1 @ M0.inverted()
            perna[pe] = Wpe
            perna["Toe" + lado] = Wdedo
        return self._perna[lado][n]

    def aplicar(self, arm_ob, pose, ik=None):
        b = self.calcular(pose, ik)
        for n, m in b.items():
            arm_ob.pose.bones[n].matrix_basis = m
        bpy.context.view_layer.update()
        return b


# ---------------- curvas de animação ----------------
# Cada curva recebe f (quadro) e n (quadros do ciclo) e devolve (pose, ik).

def _suave(k):
    k = min(1.0, max(0.0, k))
    return k * k * (3 - 2 * k)


def _sino(t, centro, largura):
    return math.exp(-((t - centro) / largura) ** 2)


def curva_idle(f, n):
    fi = 2 * math.pi * f / n
    s, s2 = math.sin(fi), math.sin(2 * fi)
    peso = 0.012 * s  # passa o peso de um pé para o outro, devagar
    return {
        # o lado que recebe o peso sobe (+Y baixa o lado esquerdo do quadril)
        "Hips": ((0, -1.5 * s, 1.0 * math.sin(fi + 0.6)), (peso, 0, -0.005 + 0.0015 * s2)),
        "Spine": ((0.5 * s2, 1.0 * s, 0), None),
        "Spine1": ((0.6 * s2, 0.5 * s, -0.5 * math.sin(fi + 0.6)), None),
        "Spine2": ((-1.0 * s2, 0, 0), None),
        "Neck": ((0.4 * s2, 0, 0), None),
        "Head": ((-0.5 * s2, 0.6 * s, 4 * math.sin(fi + 1.2)), None),
        # respiração: os ombros sobem um pouco (clavícula esquerda sobe com -Y, a direita com +Y)
        "Shoulder_L": ((0, -1.0 * s2, 0), None),
        "Shoulder_R": ((0, 1.0 * s2, 0), None),
        "UpperArm_L": ((2 + 1.5 * s2, 2, 0), None),
        "UpperArm_R": ((2 + 1.5 * s2, -2, 0), None),
        "LowerArm_L": ((-12 - 2 * s2, 0, 0), None),
        "LowerArm_R": ((-12 - 2 * s2, 0, 0), None),
    }, {"_L": {"pe": (0.005, 0.0, 0)}, "_R": {"pe": (-0.005, -0.03, 0), "giro": -8}}


def _pe_andando(t, passo, apoio, altura, pitch_sai, pitch_entra):
    """Trajetória de um pé no ciclo (t em 0..1, 0 = calcanhar toca à frente)."""
    if t < apoio:  # no chão, indo para trás
        k = t / apoio
        y = -passo + 2 * passo * k
        h = 0.0
        # chega com a ponta um pouco para cima, assenta, e no fim o calcanhar sobe
        pitch = pitch_entra * (1 - _suave(k / 0.15)) + pitch_sai * _suave((k - 0.65) / 0.35)
        dedos = -pitch_sai * _suave((k - 0.65) / 0.35)
    else:  # no ar, voltando para a frente
        k = (t - apoio) / (1 - apoio)
        y = passo - 2 * passo * _suave(k)
        h = altura * math.sin(math.pi * min(1.0, k * 1.15)) ** 1.5
        pitch = pitch_sai * (1 - _suave(k / 0.5)) + pitch_entra * _suave((k - 0.5) / 0.5)
        dedos = -pitch_sai * (1 - _suave(k / 0.3))
    return y, h, pitch, dedos


def curva_andar(f, n):
    t = f / n
    fi = 2 * math.pi * t
    pe = {}
    for lado, fase, s in (("_L", 0.0, 1), ("_R", 0.5, -1)):
        y, h, pitch, dedos = _pe_andando((t + fase) % 1, 0.24, 0.6, 0.07, 32, -10)
        # passo de passarela: o pé pousa perto da linha do meio
        pe[lado] = {"pe": (-s * 0.035, y, h), "pitch": pitch, "dedos": dedos}
    c, cs = math.cos(fi), math.sin(fi)
    meio = math.cos(2 * (fi - 0.6 * math.pi))  # 1 no meio do apoio de cada pé
    return {
        "Hips": ((2, -5 * math.cos(fi - 0.6 * math.pi), -7 * c), (0.022 * math.cos(fi - 0.6 * math.pi), 0, -0.015 + 0.01 * meio)),
        "Spine": ((1.5, 2.5 * math.cos(fi - 0.6 * math.pi), 3 * c), None),
        "Spine1": ((1, 1.5 * math.cos(fi - 0.6 * math.pi), 4 * c), None),
        "Spine2": ((-1.5, 0.5 * math.cos(fi - 0.6 * math.pi), 4 * c), None),
        "Neck": ((0, 0, -2 * c), None),
        "Head": ((1 - 0.8 * meio, 0, -2 * c), None),
        # o ombro acompanha o braço que vai à frente (clavícula: +Z leva a esquerda para trás e a
        # direita para a frente)
        "Shoulder_L": ((0, 0, 2 * c), None),
        "Shoulder_R": ((0, 0, 2 * c), None),
        "UpperArm_L": ((16 * c, 3, 0), None),
        "UpperArm_R": ((-16 * c, -3, 0), None),
        "LowerArm_L": ((-14 - 12 * max(0.0, -c), 0, 0), None),
        "LowerArm_R": ((-14 - 12 * max(0.0, c), 0, 0), None),
    }, pe


def _pe_correndo(t):
    """Corrida: 35% no chão; no ar o pé sobe atrás (calcanhar no bumbum) e vem por cima."""
    apoio, passo = 0.35, 0.34
    if t < apoio:
        k = t / apoio
        return -passo + 2 * passo * k, 0.0, 22 * _suave((k - 0.4) / 0.6) - 4 * (1 - _suave(k / 0.2)), -18 * _suave((k - 0.5) / 0.5)
    k = (t - apoio) / (1 - apoio)
    # (y, altura) em pontos de controle, ligados por cossenos
    pts = [(passo, 0.0), (passo + 0.12, 0.30), (0.05, 0.38), (-passo - 0.04, 0.12), (-passo, 0.0)]
    seg = min(3, int(k * 4))
    u = _suave(k * 4 - seg)
    (y0, h0), (y1, h1) = pts[seg], pts[seg + 1]
    pitch = 22 * (1 - _suave(k / 0.4)) + 30 * _sino(k, 0.45, 0.2) - 4 * _suave((k - 0.8) / 0.2)
    return y0 + (y1 - y0) * u, h0 + (h1 - h0) * u, pitch, -18 * (1 - _suave(k / 0.25))


def curva_correr(f, n):
    t = f / n
    fi = 2 * math.pi * t
    pe = {}
    for lado, fase, s in (("_L", 0.0, 1), ("_R", 0.5, -1)):
        y, h, pitch, dedos = _pe_correndo((t + fase) % 1)
        pe[lado] = {"pe": (-s * 0.03, y, h), "pitch": pitch, "dedos": dedos}
    c = math.cos(fi)
    voo = math.cos(2 * (fi - 0.85 * math.pi))  # 1 no meio do voo, -1 no meio do apoio
    return {
        "Hips": ((9, -4 * math.cos(fi - 0.35 * math.pi), -9 * c), (0.012 * math.cos(fi - 0.35 * math.pi), 0, -0.045 + 0.025 * voo)),
        "Spine": ((3, 2 * math.cos(fi - 0.35 * math.pi), 4 * c), None),
        "Spine1": ((2, 1, 5 * c), None),
        "Spine2": ((1, 0, 6 * c), None),
        "Neck": ((-4, 0, -3 * c), None),
        "Head": ((-5 - 1.5 * voo, 0, -3 * c), None),
        "Shoulder_L": ((0, 0, 3 * c), None),
        "Shoulder_R": ((0, 0, 3 * c), None),
        "UpperArm_L": ((34 * c - 6, 6, 0), None),
        "UpperArm_R": ((-34 * c - 6, -6, 0), None),
        "LowerArm_L": ((-80 - 15 * max(0.0, -c), 0, 0), None),
        "LowerArm_R": ((-80 - 15 * max(0.0, c), 0, 0), None),
        "Hand_L": ((-10, 0, 0), None),
        "Hand_R": ((-10, 0, 0), None),
    }, pe


def curva_pular(f, n):
    # no ar (o jogo toca em laço enquanto ela não pousa): pernas recolhidas, uma mais que a
    # outra, braços abertos para equilibrar, tudo balançando de leve
    fi = 2 * math.pi * f / n
    s = math.sin(fi)
    return {
        "Hips": ((-4 + 2 * s, 0, 0), (0, 0, 0.0)),
        "Spine": ((2, 0, 0), None),
        "Spine2": ((3 + 1.5 * s, 0, 0), None),
        "Head": ((-6, 0, 0), None),
        "UpperLeg_L": ((-55 - 6 * s, -4, 0), None),
        "LowerLeg_L": ((85 + 6 * s, 0, 0), None),
        "Foot_L": ((25, 0, 0), None),
        "UpperLeg_R": ((-18 + 5 * s, 4, 0), None),
        "LowerLeg_R": ((55 - 5 * s, 0, 0), None),
        "Foot_R": ((25, 0, 0), None),
        "Shoulder_L": ((0, -6, 0), None),
        "Shoulder_R": ((0, 6, 0), None),
        "UpperArm_L": ((-30 + 4 * s, -38 - 5 * s, 0), None),
        "UpperArm_R": ((-18 - 4 * s, 38 + 5 * s, 0), None),
        "LowerArm_L": ((-55, 0, 0), None),
        "LowerArm_R": ((-45, 0, 0), None),
    }, None


def curva_sentar(f, n):
    # sentada numa cadeira: o jogo desce o modelo até o osso do quadril ficar perto do assento
    fi = 2 * math.pi * f / n
    s = math.sin(fi)
    return {
        "Hips": ((-6, 0, 0), None),
        "Spine": ((3, 0, 0), None),
        "Spine1": ((1 + 0.8 * s, 0, 0), None),
        "Spine2": ((-1.5 * s, 0, 0), None),
        "Head": ((3 + 0.8 * s, 0, 4), None),
        "UpperLeg_L": ((-84, -3, 0), None),
        "UpperLeg_R": ((-84, 3, 0), None),
        "LowerLeg_L": ((80, 0, 0), None),
        "LowerLeg_R": ((80, 0, 0), None),
        "Foot_L": ((14, 0, 0), None),
        "Foot_R": ((14, 0, 0), None),
        "UpperArm_L": ((-28, 6, 0), None),
        "UpperArm_R": ((-28, -6, 0), None),
        "LowerArm_L": ((-38, 0, 0), None),
        "LowerArm_R": ((-38, 0, 0), None),
        "Hand_L": ((12, 0, 0), None),
        "Hand_R": ((12, 0, 0), None),
    }, None


def curva_soco(f, n):
    # direto de direita: guarda, soco, segura, volta
    t = f / n
    guarda = _suave(t / 0.22) * (1 - _suave((t - 0.62) / 0.38))
    estica = _suave((t - 0.22) / 0.16) * (1 - _suave((t - 0.55) / 0.25))
    giro = -6 * guarda + 30 * estica  # tronco: arma para a direita e gira para a esquerda no soco
    pose = {
        "Hips": ((0, 0, giro * 0.3), (0, 0, -0.03 * guarda)),
        "Spine": ((3 * guarda, 0, giro * 0.2), None),
        "Spine1": ((2 * guarda, 0, giro * 0.25), None),
        "Spine2": ((2 * guarda, 0, giro * 0.25), None),
        "Head": ((-3 * guarda, 0, -giro * 0.75), None),
        "Shoulder_R": ((0, 0, 8 * estica), None),
        # direito: da guarda (cotovelo baixo, punho no queixo) ao braço esticado na altura do ombro
        "UpperArm_R": rot(("X", -50 * guarda - 38 * estica), ("Z", 12 * guarda - 6 * estica)),
        "LowerArm_R": ((-115 * guarda * (1 - estica) - 8 * estica, 0, 0), None),
        "Hand_R": ((-8 * guarda, 0, 0), None),
        # esquerdo fica na guarda
        "UpperArm_L": rot(("X", -55 * guarda), ("Z", -12 * guarda)),
        "LowerArm_L": ((-120 * guarda, 0, 0), None),
        "Hand_L": ((-8 * guarda, 0, 0), None),
    }
    ik = {"_L": {"pe": (0.02 * guarda, -0.08 * guarda, 0), "giro": 8 * guarda},
          "_R": {"pe": (-0.02 * guarda, 0.10 * guarda, 0), "pitch": 12 * guarda, "dedos": -12 * guarda, "giro": -15 * guarda}}
    return pose, ik


def curva_acenar(f, n):
    t = f / n
    sobe = _suave(t / 0.18) * (1 - _suave((t - 0.82) / 0.18))
    aceno = math.sin(2 * math.pi * 3 * t) * _suave((t - 0.15) / 0.1) * (1 - _suave((t - 0.75) / 0.1))
    return {
        "Hips": ((0, 1.5 * sobe, 0), (0.008 * sobe, 0, -0.018)),
        "Spine1": ((0, -1.5 * sobe, 0), None),
        "Spine2": ((-2 * sobe, -2.5 * sobe, 3 * sobe), None),
        "Head": ((0, -4 * sobe, 6 * sobe), None),
        "Shoulder_R": ((0, 8 * sobe, 0), None),
        # braço direito: gira para fora, abre até acima do ombro e o antebraço fica em pé
        "UpperArm_R": rot(("Z", -85 * sobe), ("Y", 100 * sobe), ("X", -15 * sobe)),
        "LowerArm_R": ((-(12 + 70 * sobe) + 22 * aceno * sobe, 0, 0), None),
        "Hand_R": ((-6 * sobe, 0, 0), None),
        "UpperArm_L": ((2, 2, 0), None),
        "LowerArm_L": ((-12, 0, 0), None),
    }, {"_L": {"pe": (0.0, 0.0, 0)}, "_R": {"pe": (0.0, -0.02, 0), "giro": -6}}


ANIMACOES = [
    ("Idle", 120, curva_idle),
    ("Walk", 32, curva_andar),
    ("Run", 22, curva_correr),
    ("Jump", 40, curva_pular),
    ("Sit", 90, curva_sentar),
    ("Punch", 18, curva_soco),
    ("Wave", 48, curva_acenar),
]


# ---------------- render de validação ----------------

def configurar_camera():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x = 360
    scene.render.resolution_y = 480
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def renderizar(cam, alvo, dist, angulo, nome):
    ax, ay, az = alvo
    cam.location = (ax + dist * math.sin(angulo), ay - dist * math.cos(angulo), az)
    d = Vector(alvo) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = nome
    bpy.ops.render.render(write_still=True)


def folha(caminhos, colunas, saida):
    """Junta renders do mesmo tamanho numa folha só (PNG)."""
    imgs = []
    for c in caminhos:
        im = bpy.data.images.load(c)
        w, h = im.size
        imgs.append(np.array(im.pixels[:]).reshape(h, w, 4))
        bpy.data.images.remove(im)
    h, w = imgs[0].shape[:2]
    linhas = (len(imgs) + colunas - 1) // colunas
    tela = np.ones((linhas * h, colunas * w, 4))
    for i, a in enumerate(imgs):
        r, c = divmod(i, colunas)
        # pixels do Blender começam embaixo: a primeira linha da folha fica no alto
        tela[(linhas - 1 - r) * h:(linhas - r) * h, c * w:(c + 1) * w] = a
    out = bpy.data.images.new("folha", colunas * w, linhas * h, alpha=True)
    out.pixels = tela.ravel()
    out.filepath_raw = saida
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)
