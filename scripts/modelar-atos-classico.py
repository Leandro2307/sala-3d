# Modela o Atos clássico (a bolinha azul de olhos de pílula, o primeiro Atos) no Blender, com
# esqueleto e as animações que o jogo usa, e exporta o .glb. O Atos de hoje, que é a logo, sai de
# scripts/modelar-atos.py. Tudo é gerado aqui: para mudar cor, tamanho ou movimento, mude
# os números e rode de novo.
#
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
#     --python scripts/modelar-atos-classico.py -- public/models/atos-classico.glb [atos-classico.blend]
#
# Frente do boneco: -Y no Blender, que o exportador converte para +Z (a frente do jogo).
# Todos os ossos apontam para cima, então no espaço de cada osso: x = esquerda do boneco,
# y = cima, z = frente.
import math
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SAIDA_GLB = args[0] if args else 'atos-classico.glb'
SAIDA_BLEND = args[1] if len(args) > 1 else None

FPS = 30
R = 0.5  # raio do corpo
CZ = 0.56  # centro do corpo (a base afunda um pouco nos pés, que só aparecem na ponta)

bpy.ops.wm.read_factory_settings(use_empty=True)
cena = bpy.context.scene
cena.render.fps = FPS


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
        # o veludo clareia a borda contra a luz: é o "halo" branco do desenho original
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


MAT_CORPO = material('Corpo', (1, 1, 1), 0.3, verniz=0.55, brilho=(0.0, 0.18, 1.0), forca=0.25,
                     veludo=0.7, usar_cor_vertice=True)
MAT_OLHO = material('Olho', (0.004, 0.005, 0.009), 0.12, verniz=1.0)
MAT_BRILHO = material('Brilho do olho', (1, 1, 1), 0.4, brilho=(1, 1, 1), forca=1.0)


def srgb(c):
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def misturar(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


# azul elétrico do desenho: mais claro na frente e em cima, mais fundo embaixo e atrás
AZUL_CLARO = srgb((0.30, 0.64, 1.0))
AZUL = srgb((0.03, 0.42, 1.0))
AZUL_FUNDO = srgb((0.0, 0.25, 0.86))


# ------------------------------------------------------------------ peças

def objeto(nome, bm, mat, osso, cor=None):
    """Cria o objeto da peça, pinta os vértices e marca o osso que a move (peso 1)."""
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(nome, me)
    bpy.context.collection.objects.link(ob)
    attr = me.color_attributes.new('Cor', 'BYTE_COLOR', 'POINT')
    for i, v in enumerate(me.vertices):
        c = cor(v.co, v.normal) if cor else (1, 1, 1)
        attr.data[i].color = (*c, 1)
    vg = ob.vertex_groups.new(name=osso)
    vg.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    return ob


def esfera(raio=1.0, seg=48, aneis=24):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=aneis, radius=raio)
    return bm


def transformar(bm, m):
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def assentar(co):
    """Ponto em volta do centro da bola → no lugar: a bola é levemente mais larga embaixo, como
    quem assenta o peso no chão."""
    x, y, z = co
    z *= 0.97
    if z < 0:
        k = 1 + 0.035 * (-z / R)
        x, y = x * k, y * k
    return Vector((x, y, z + CZ))


# corpo: a bola
bm = esfera(R, 72, 36)
for v in bm.verts:
    v.co = assentar(v.co)
bm.normal_update()


def cor_corpo(co, n):
    frente = -n.y * 0.8 + n.z * 0.2
    if frente > 0:
        return misturar(AZUL, AZUL_CLARO, frente ** 1.4)
    return misturar(AZUL, AZUL_FUNDO, (-frente) ** 0.9)


# a bola vai no osso Head, filho do Body: o Body amassa e estica, o Head inclina e olha em volta.
# "Head" também é o nome que o jogo procura para pôr a webcam no rosto.
corpo = objeto('Corpo', bm, MAT_CORPO, 'Head', cor_corpo)
# o corpo já pronto serve de alvo para assentar os olhos na superfície
bpy.context.view_layer.update()


def na_superficie(x, z):
    """Ponto e normal da frente do corpo na altura/largura dadas."""
    origem = Vector((x, -2.0, z))
    ok, ponto, normal, _ = corpo.ray_cast(origem, Vector((0, 1, 0)))
    assert ok, (x, z)
    return ponto, normal.normalized()


def base_na_superficie(ponto, normal, afundar):
    # eixo y local aponta para dentro do corpo (o -y do olho é a frente), z local é o "cima"
    y = -normal
    z = (Vector((0, 0, 1)) - Vector((0, 0, 1)).dot(normal) * normal).normalized()
    x = y.cross(z).normalized()
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = ponto - normal * afundar
    return m


# olhos: pílulas pretas em pé, um pouco em relevo, com o brilho no alto (é o que dá vida)
OLHO_R = 0.071  # meia largura
OLHO_H = 0.04  # meio trecho reto (meia altura = OLHO_R + OLHO_H)
OLHO_PROF = 0.38
OLHO_X = 0.112
OLHO_Z = CZ + 0.1
OLHO_FUNDO = 0.016  # quanto o olho afunda no corpo: só um relevo, sem virar óculos
olhos = {}
for lado, sx in (('L', 1), ('R', -1)):
    ponto, normal = na_superficie(sx * OLHO_X, OLHO_Z)
    base = base_na_superficie(ponto, normal, OLHO_FUNDO)

    bm = esfera(OLHO_R, 32, 16)
    for v in bm.verts:
        v.co.z += OLHO_H if v.co.z > 1e-6 else (-OLHO_H if v.co.z < -1e-6 else 0)
        v.co.y *= OLHO_PROF
    transformar(bm, base)
    objeto(f'Olho.{lado}', bm, MAT_OLHO, f'Eye.{lado}')

    # brilho: no alto à esquerda de quem olha, nos dois olhos (a mesma luz)
    bm = esfera(0.019, 16, 8)
    transformar(bm, Matrix.Diagonal((1.0, 0.45, 1.35, 1)))
    transformar(bm, Matrix.Translation((-0.026, -OLHO_R * OLHO_PROF * 0.86, 0.054)))
    transformar(bm, base)
    objeto(f'Brilho.{lado}', bm, MAT_BRILHO, f'Eye.{lado}')
    bm = esfera(0.008, 12, 6)
    transformar(bm, Matrix.Diagonal((1.0, 0.45, 1.0, 1)))
    transformar(bm, Matrix.Translation((0.028, -OLHO_R * OLHO_PROF * 0.8, -0.065)))
    transformar(bm, base)
    objeto(f'Brilho2.{lado}', bm, MAT_BRILHO, f'Eye.{lado}')
    olhos[lado] = ponto - normal * OLHO_FUNDO  # centro do olho: onde fica o osso do piscar


def cor_membro(co, n):
    return misturar(AZUL, AZUL_CLARO, max(0.0, n.z * 0.7 - n.y * 0.3)) if n.z - n.y * 0.4 > 0 \
        else misturar(AZUL, AZUL_FUNDO, min(1.0, -n.z * 0.8))


# Curvinha: a mesma do Atos novo (scripts/modelar-atos.py), a ponta que a logo tem embaixo à
# direita. É uma escama em relevo na lateral esquerda do boneco, no contorno visto de frente: nasce
# rente à bola, sobe acompanhando o arco de fora da logo e acaba em gancho — a crista chega na ponta
# e a base recua até o entalhe. Do tamanho exato da logo (10% do raio) ela sumia entre a mão e o
# pé: aqui sobe o dobro.
CURVINHA = (-0.2155, -0.0678, 1.1867)  # arco de fora (centro x, y e raio, no raio da bola = 1)
# ângulos em volta do centro, vistos de frente (0 = esquerda do boneco): onde o arco sai do contorno,
# a ponta e o entalhe
C_EMENDA, C_PONTA, C_ENTALHE = math.radians(-20.318), math.radians(-58.31), math.radians(-52.571)
CURVINHA_ALTURA = 2.0
CURVINHA_LARGURA = math.radians(17)  # quanto a escama avança para a frente e para trás do contorno


def raio_curvinha(ph):
    """Distância do centro até o arco de fora, na direção ph (1 = contorno da bola)."""
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
bm = bmesh.new()
grade_c = []
for i in range(NS + 1):
    t_s = 0.02 + 0.98 * i / NS  # ao longo da escama: da emenda (rente à borda) até a ponta
    ph_s = C_EMENDA + (C_PONTA - C_EMENDA) * t_s
    alt = R * (raio_curvinha(ph_s) - 1) * CURVINHA_ALTURA
    meia = CURVINHA_LARGURA * math.sqrt(t_s * max(0.0, 1 - t_s ** 4))
    gancho = (C_ENTALHE - C_PONTA) * suave(0.6, 1.0, t_s)
    linha = []
    for j in range(NT + 1):
        u = -1 + 2 * j / NT  # de um lado ao outro da escama
        c = (1 - u * u) ** 0.6  # seção arredondada: a borda encontra a casca de pé
        th, ph = math.pi / 2 + meia * u, ph_s + gancho * (1 - c)
        d = Vector((math.sin(th) * math.cos(ph), -math.cos(th), math.sin(th) * math.sin(ph)))
        # a borda fica 3 mm para dentro da casca
        linha.append(bm.verts.new(assentar(d * (R + alt * c - 0.003))))
    grade_c.append(linha)
# a grade tem um sentido só: acerta pela face do meio (bem de frente para fora) e vale para todas
a_, b_, c_ = (grade_c[NS // 2][NT // 2].co, grade_c[NS // 2 + 1][NT // 2].co, grade_c[NS // 2 + 1][NT // 2 + 1].co)
inverte = (b_ - a_).cross(c_ - a_).dot(a_ - Vector((0, 0, CZ))) < 0
for i in range(NS):
    for j in range(NT):
        q = [grade_c[i][j], grade_c[i + 1][j], grade_c[i + 1][j + 1], grade_c[i][j + 1]]
        bm.faces.new(q[::-1] if inverte else q)
bm.normal_update()
objeto('Curvinha', bm, MAT_CORPO, 'Head', cor_corpo)

# mãos: gotinhas soltas ao lado do corpo, como no desenho, com a ponta inclinada para dentro, um
# pouco acima da curvinha (mais baixas, a mão esquerda e a escama pareciam um braço só)
MAO = {}
for lado, sx in (('L', 1), ('R', -1)):
    centro = Vector((sx * 0.6, -0.01, CZ - 0.07))
    bm = esfera(1.0, 32, 16)
    for v in bm.verts:
        x, y, z = v.co
        afina = 1 - 0.28 * max(0.0, z) ** 2  # a ponta de cima mais fina: gota
        v.co = Vector((x * 0.078 * afina, y * 0.09 * afina, z * 0.122))
    transformar(bm, Matrix.Rotation(-sx * 0.38, 4, 'Y'))
    transformar(bm, Matrix.Translation(centro))
    bm.normal_update()
    MAO[lado] = centro
    objeto(f'Mao.{lado}', bm, MAT_CORPO, f'Hand.{lado}', cor_membro)

# pés: dois feijões embaixo da bola, a ponta aparecendo na frente e um pouco para fora. Ficam por
# dentro da ponta da curvinha, para o passo não atravessá-la.
PE_ALT = 0.075
PE = {}
for lado, sx in (('L', 1), ('R', -1)):
    centro = Vector((sx * 0.17, -0.15, 0))
    bm = esfera(1.0, 32, 16)
    for v in bm.verts:
        x, y, z = v.co
        if z < 0:
            z *= 0.7  # sola mais reta
        v.co = Vector((x * 0.11, y * 0.155, z * PE_ALT))
    transformar(bm, Matrix.Rotation(sx * 0.16, 4, 'Z'))
    # a sola achatada fica a PE_ALT * 0,7 abaixo do centro: subindo isso ela encosta em y=0
    centro.z = PE_ALT * 0.7
    transformar(bm, Matrix.Translation(centro))
    bm.normal_update()
    PE[lado] = centro
    objeto(f'Pe.{lado}', bm, MAT_CORPO, f'Foot.{lado}', cor_membro)

# junta tudo numa malha só (três materiais, um desenho por material)
pecas = [o for o in bpy.context.collection.objects if o.type == 'MESH']
for o in pecas:
    o.select_set(True)
bpy.context.view_layer.objects.active = corpo
bpy.ops.object.join()
corpo.name = 'Atos'
corpo.data.name = 'Atos'
bpy.ops.object.select_all(action='DESELECT')


# ------------------------------------------------------------------ esqueleto

arm_data = bpy.data.armatures.new('Esqueleto')
arm = bpy.data.objects.new('Armature', arm_data)
bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')


def osso(nome, cabeca, pai=None, comp=0.12):
    b = arm_data.edit_bones.new(nome)
    b.head = Vector(cabeca)
    b.tail = Vector(cabeca) + Vector((0, 0, comp))
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
for lado in ('L', 'R'):
    osso(f'Eye.{lado}', olhos[lado], 'Head', 0.08)
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


def onda(t, periodo, fase=0.0):
    return math.sin(2 * math.pi * t / periodo + fase)


def piscar(t, inicio, dur=7):
    """Escala vertical do olho num piscar: 1 → 0,08 → 1."""
    if t < inicio or t > inicio + dur:
        return 1.0
    x = (t - inicio) / dur
    return 1 - 0.92 * math.sin(math.pi * x) ** 0.6


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


ZERO = (0, 0, 0)
UM = (1, 1, 1)


def esmagar(k):
    """Amassa (k>0) ou estica (k<0) mantendo o volume mais ou menos igual."""
    return (1 + k * 0.5, 1 - k, 1 + k * 0.5)


# Parado: respira, as mãos flutuam fora de fase, olha de leve para os lados e pisca
def idle(t):
    P = 90
    resp = onda(t, P / 2)
    return {
        'Body': (ZERO, ZERO, esmagar(-0.022 * resp)),
        'Head': (ZERO, (0.02 * onda(t, P, 1.2), 0.07 * onda(t, P, 0.4), 0.03 * onda(t, P)), UM),
        'Hand.L': ((0, 0.022 * onda(t, P / 2, 0.6), 0.01 * onda(t, P)), (0, 0, 0.08 * onda(t, P / 2, 0.6)), UM),
        'Hand.R': ((0, 0.022 * onda(t, P / 2, 1.4), -0.01 * onda(t, P)), (0, 0, -0.08 * onda(t, P / 2, 1.4)), UM),
        'Eye.L': (ZERO, ZERO, (1, piscar(t, 56), 1)),
        'Eye.R': (ZERO, ZERO, (1, piscar(t, 56), 1)),
    }


def flutuar(t, P, sobe, onda_alt, inclina, arrasto, abre_mao, pe_atras):
    """Andar de fantasma: ele não tem perna, então em vez de dar passo sai do chão e vai em ondas.
    Sobe e desce uma vez por ciclo e inclina com a onda (de nariz para cima subindo, para baixo
    descendo, como barco). Mãos e pés vêm arrastados atrás, cada um um pouco atrasado na onda, como
    a barra de um lençol: é esse atraso que faz parecer solto no ar."""
    fi = 2 * math.pi * t / P
    s, c = math.sin(fi), math.cos(fi)
    pose = {
        # deriva de leve para os lados, um quarto de onda depois do sobe e desce: o corpo desenha
        # uma volta no ar em vez de só subir e descer
        'Hips': ((0.018 * math.sin(fi - math.pi / 2), sobe + onda_alt * s, 0),
                 (inclina - 1.6 * onda_alt * c, 0.05 * s, 0.06 * math.sin(fi - math.pi / 2)), UM),
        # estica subindo, achata descendo
        'Body': (ZERO, ZERO, esmagar(-0.9 * onda_alt * c)),
        # a cabeça desfaz metade da inclinação e acena atrasada, para os olhos ficarem no caminho
        'Head': (ZERO, (-inclina * 0.5 + 0.04 * math.sin(fi - 1.2), -0.03 * s, 0), UM),
        'Eye.L': (ZERO, ZERO, (1, piscar(t, P // 2), 1)),
        'Eye.R': (ZERO, ZERO, (1, piscar(t, P // 2), 1)),
    }
    for lado, sx, f in (('L', 1, 0.0), ('R', -1, math.pi)):
        # mãos (penduradas no quadril, já sobem com ele): abertas, para trás, ondulando atrasadas
        # e uma fora de fase da outra
        m = math.sin(fi - 1.1 + f * 0.35)
        pose[f'Hand.{lado}'] = ((sx * abre_mao, 0.05 + 0.04 * m, -arrasto),
                                (-0.3 - 0.25 * m, 0, -sx * (0.15 + 0.12 * m)), UM)
        # pés (no Root, não sobem sozinhos): recolhidos rente à barriga e um pouco menores, só a
        # ponta aparecendo, acompanham o corpo com atraso e batem devagar um contra o outro, como a
        # barra do lençol ondulando. Pendurados para baixo, ele parecia andar na ponta dos pés.
        p = math.sin(fi - 1.6 + f)
        pose[f'Foot.{lado}'] = ((sx * 0.015, sobe + RECOLHE_PE + onda_alt * math.sin(fi - 0.7) + 0.02 * p, -pe_atras),
                                (0.4 + 0.2 * p, 0, 0), (0.85,) * 3)
    return pose


# o quanto ele sai do chão andando, e o quanto os pés sobem para dentro da barriga
FLUTUA = 0.16
RECOLHE_PE = 0.035


def walk(t):
    return flutuar(t, 36, sobe=FLUTUA, onda_alt=0.035, inclina=0.1, arrasto=0.04, abre_mao=0.03, pe_atras=0.08)


def run(t):
    # o jogo toca a corrida 1,6x mais rápido: 42 quadros dão uma onda a cada 0,9 s. Mais inclinado,
    # mais alto, e mãos e pés esticados para trás como quem é levado pelo vento
    return flutuar(t, 42, sobe=FLUTUA + 0.03, onda_alt=0.045, inclina=0.26, arrasto=0.1, abre_mao=0.05,
                   pe_atras=0.14)


# No ar: esticado, mãos para cima, pés encolhidos e olhos arregalados
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
        pose[f'Eye.{lado}'] = (ZERO, ZERO, (1.08, 1.14, 1))
    return pose


# Sentado: assenta o peso (amassa um pouco), pés para a frente balançando, mãos apoiadas
def sit(t):
    P = 90
    resp = onda(t, P / 2)
    pose = {
        'Hips': ((0, -0.015, -0.04), (-0.1, 0, 0), UM),
        'Body': (ZERO, ZERO, esmagar(0.06 - 0.02 * resp)),
        'Head': (ZERO, (0.06, 0.06 * onda(t, P, 0.5), 0.025 * onda(t, P)), UM),
        'Eye.L': (ZERO, ZERO, (1, piscar(t, 40), 1)),
        'Eye.R': (ZERO, ZERO, (1, piscar(t, 40), 1)),
    }
    for lado, sx, fase in (('L', 1, 0.0), ('R', -1, math.pi)):
        pose[f'Foot.{lado}'] = ((sx * 0.02, 0.085 + 0.02 * onda(t, P / 2, fase), 0.27),
                                (-0.5 + 0.12 * onda(t, P / 2, fase), 0, 0), UM)
        pose[f'Hand.{lado}'] = ((sx * 0.02, -0.09 + 0.012 * resp, 0.05), (0.2, 0, sx * -0.15), UM)
    return pose


# Aceno (toca uma vez): a mão direita sobe ao lado da cabeça e balança três vezes
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
        'Eye.L': (ZERO, ZERO, (1, piscar(t, 37, 6), 1)),
        'Eye.R': (ZERO, ZERO, (1, piscar(t, 37, 6), 1)),
    }


# Soco (toca uma vez): puxa a mão direita para trás, gira o corpo e dispara para a frente
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
        'Eye.L': (ZERO, ZERO, (1, 1 - 0.35 * soco, 1)),
        'Eye.R': (ZERO, ZERO, (1, 1 - 0.35 * soco, 1)),
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
