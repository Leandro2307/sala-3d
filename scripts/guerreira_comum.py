# Código comum do rig procedural da guerreira: juntas, esqueleto, poses e renders.
# A personagem está de pé na origem, olhando para -Y, ~1,90 m (salto incluso).
import bpy, json, math
from mathutils import Vector, Matrix, Euler, Quaternion

GRAU = math.pi / 180


def importar(fbx_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    malha = next(ob for ob in bpy.data.objects if ob.type == "MESH")
    return malha


def vertices_mundo(malha):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = malha.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    pts = [mw @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def _centro(sel):
    if not sel:
        return None
    c = Vector((0, 0, 0))
    for p in sel:
        c += p
    return c / len(sel)


def detectar_juntas(pts):
    """Acha as juntas medindo a própria malha, por faixas de altura."""
    def faixa(z0, z1, filtro=None):
        sel = [p for p in pts if z0 <= p.z < z1 and (filtro is None or filtro(p))]
        return sel

    def por_lado(sel):
        esq = [p for p in sel if p.x > 0]
        dir_ = [p for p in sel if p.x < 0]
        return esq, dir_

    j = {}
    # tronco: linha da coluna pelo centro de cada faixa
    for nome, z0, z1 in [("hips", 0.96, 1.06), ("spine", 1.10, 1.20),
                         ("spine1", 1.22, 1.32), ("spine2", 1.36, 1.46)]:
        sel = faixa(z0, z1, lambda p: abs(p.x) < 0.14)
        ys = sorted(p.y for p in sel)
        j[nome + "_y"] = ys[len(ys) // 2] if ys else 0.0

    # braços pendidos: fora do tronco
    braco = lambda p: abs(p.x) > 0.17
    ombro_esq, ombro_dir = por_lado(faixa(1.42, 1.52, lambda p: 0.10 < abs(p.x) < 0.26))
    coto_esq, coto_dir = por_lado(faixa(1.15, 1.28, braco))
    punho_esq, punho_dir = por_lado(faixa(0.92, 1.02, braco))
    mao_esq, mao_dir = por_lado(faixa(0.78, 0.92, braco))
    j["ombro"] = (_centro(ombro_esq), _centro(ombro_dir))
    j["cotovelo"] = (_centro(coto_esq), _centro(coto_dir))
    j["punho"] = (_centro(punho_esq), _centro(punho_dir))
    j["mao"] = (_centro(mao_esq), _centro(mao_dir))

    # pernas
    perna = lambda p: abs(p.x) < 0.16
    quad_esq, quad_dir = por_lado(faixa(0.94, 1.04, perna))
    joelho_esq, joelho_dir = por_lado(faixa(0.48, 0.58, perna))
    torn_esq, torn_dir = por_lado(faixa(0.10, 0.17, perna))
    pe_esq, pe_dir = por_lado([p for p in pts if p.z < 0.085 and abs(p.x) < 0.16])
    j["quadril"] = (_centro(quad_esq), _centro(quad_dir))
    j["joelho"] = (_centro(joelho_esq), _centro(joelho_dir))
    j["tornozelo"] = (_centro(torn_esq), _centro(torn_dir))
    j["pe"] = (_centro(pe_esq), _centro(pe_dir))

    # pescoço e cabeça
    pes = faixa(1.47, 1.55, lambda p: abs(p.x) < 0.09)
    j["pescoco"] = _centro(pes)
    cab = [p for p in pts if p.z > 1.60]
    j["cabeca"] = _centro(cab)
    j["topo"] = max(p.z for p in cab)

    # seios: ponta que sai na frente do peito
    esterno = [p for p in pts if 1.27 <= p.z < 1.45 and abs(p.x) < 0.03]
    frente = min(p.y for p in esterno) if esterno else -0.08
    seio = lambda p: 1.26 <= p.z < 1.45 and 0.025 < abs(p.x) < 0.15 and p.y < frente + 0.005
    seio_esq, seio_dir = por_lado([p for p in pts if seio(p)])
    j["frente_esterno"] = frente
    j["seio"] = (_centro(seio_esq), _centro(seio_dir))
    return j


# ---------------- esqueleto ----------------

def construir_armadura(j):
    """Cria o esqueleto em rest pose igual à pose da malha. Devolve o objeto."""
    H = j["topo"]
    yq = j["hips_y"]

    def P(x, y, z):
        return Vector((x, y, z))

    om_e, om_d = j["ombro"]
    ct_e, ct_d = j["cotovelo"]
    pu_e, pu_d = j["punho"]
    ma_e, ma_d = j["mao"]
    qd_e, qd_d = j["quadril"]
    jo_e, jo_d = j["joelho"]
    ta_e, ta_d = j["tornozelo"]
    pe_e, pe_d = j["pe"]
    se_e, se_d = j["seio"]
    pes = j["pescoco"]

    quadril = P(0, yq, 1.00)
    spine = P(0, j["spine_y"], 1.13)
    spine1 = P(0, j["spine1_y"], 1.25)
    spine2 = P(0, j["spine2_y"], 1.37)
    pescoco = P(0, pes.y, max(1.47, pes.z - 0.03))
    cabeca = P(0, j["cabeca"].y + 0.04, 1.57)

    # (nome, pai, cabeça, rabo)
    spec = [
        ("Hips", None, quadril, spine),
        ("Spine", "Hips", spine, spine1),
        ("Spine1", "Spine", spine1, spine2),
        ("Spine2", "Spine1", spine2, pescoco),
        ("Neck", "Spine2", pescoco, cabeca),
        ("Head", "Neck", cabeca, P(0, cabeca.y + 0.06, min(H - 0.03, 1.80))),
        ("Breast_L", "Spine2", P(se_e.x * 0.55, j["frente_esterno"] + 0.015, se_e.z + 0.03),
         P(se_e.x, se_e.y + 0.01, se_e.z)),
        ("Breast_R", "Spine2", P(se_d.x * 0.55, j["frente_esterno"] + 0.015, se_d.z + 0.03),
         P(se_d.x, se_d.y + 0.01, se_d.z)),
    ]
    for lado, s in (("_L", 1), ("_R", -1)):
        om = om_e if s > 0 else om_d
        ct = ct_e if s > 0 else ct_d
        pu = pu_e if s > 0 else pu_d
        ma = ma_e if s > 0 else ma_d
        qd = qd_e if s > 0 else qd_d
        jo = jo_e if s > 0 else jo_d
        ta = ta_e if s > 0 else ta_d
        pe = pe_e if s > 0 else pe_d
        clav = P(s * 0.05, j["spine2_y"], 1.47)
        spec += [
            ("Shoulder" + lado, "Spine2", clav, om),
            ("UpperArm" + lado, "Shoulder" + lado, om, ct),
            ("LowerArm" + lado, "UpperArm" + lado, ct, pu),
            ("Hand" + lado, "LowerArm" + lado, pu, ma),
            ("UpperLeg" + lado, "Hips", P(qd.x, yq, 0.99), jo),
            ("LowerLeg" + lado, "UpperLeg" + lado, jo, ta),
            ("Foot" + lado, "LowerLeg" + lado, ta, pe),
            ("Toe" + lado, "Foot" + lado, pe, P(pe.x, pe.y - 0.08, 0.01)),
        ]

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


# ---------------- poses (rotações em espaço do mundo, sobre a cabeça do osso) ----------------

def ordem_ossos(arm_ob):
    res, fila = [], [b for b in arm_ob.data.bones if not b.parent]
    while fila:
        b = fila.pop(0)
        res.append(b.name)
        fila.extend(b.children)
    return res


def calcular_basis(arm_ob, pose):
    """pose: {osso: (euler_xyz_graus, delta_loc)} -> {osso: matrix_basis}."""
    bones = arm_ob.data.bones
    pose_arm = {}
    for nome in ordem_ossos(arm_ob):
        b = bones[nome]
        rest = b.matrix_local.copy()
        head = rest.translation.copy()
        eu, dl = pose.get(nome, (None, None))
        D = Euler(tuple(g * GRAU for g in eu), "XYZ").to_matrix().to_4x4() if eu else Matrix.Identity(4)
        if b.parent:
            p_rest = b.parent.matrix_local
            head_anim = pose_arm[b.parent.name] @ (p_rest.inverted() @ head)
        else:
            head_anim = head + (Vector(dl) if dl else Vector((0, 0, 0)))
        pose_arm[nome] = (Matrix.Translation(head_anim) @ D
                          @ Matrix.Translation(-head) @ rest)
    basis = {}
    for nome in ordem_ossos(arm_ob):
        b = bones[nome]
        rest = b.matrix_local
        if b.parent:
            rel = b.parent.matrix_local.inverted() @ rest
            basis[nome] = (pose_arm[b.parent.name] @ rel).inverted() @ pose_arm[nome]
        else:
            basis[nome] = rest.inverted() @ pose_arm[nome]
    return basis


def aplicar_pose(arm_ob, pose):
    basis = calcular_basis(arm_ob, pose)
    for nome, m in basis.items():
        arm_ob.pose.bones[nome].matrix_basis = m
    bpy.context.view_layer.update()


# ---------------- curvas de animação ----------------
# Cada função recebe f (quadro) e devolve a pose do quadro.

def curva_idle(f, n):
    fi = 2 * math.pi * f / n
    s = math.sin(fi)
    return {
        "Hips": ((0.4 * s, 0, 0.8 * s), (0, 0, 0.004 * s)),
        "Spine": ((0.5 * s, 0, 0), None),
        "Spine2": ((1.4 * s, 0, -0.6 * s), None),
        "Neck": ((-0.5 * s, 0, 0), None),
        "Head": ((-0.8 * s, 0, 0.4 * s), None),
        "UpperArm_L": ((0, 1.5, 0), None),
        "UpperArm_R": ((0, -1.5, 0), None),
        "LowerArm_L": ((-4, 0, 0), None),
        "LowerArm_R": ((-4, 0, 0), None),
    }


def _passo(fi, amp_perna, amp_joelho, amp_braco, cotovelo):
    s, sp = math.sin(fi), math.sin(fi + math.pi)
    joelho_l = -5 - amp_joelho * max(0.0, math.sin(fi - 1.05)) ** 1.3
    joelho_r = -5 - amp_joelho * max(0.0, math.sin(fi + math.pi - 1.05)) ** 1.3
    perna_l, perna_r = amp_perna * s, amp_perna * sp
    return perna_l, perna_r, joelho_l, joelho_r, s


def curva_andar(f, n):
    fi = 2 * math.pi * f / n
    pl, pr, jl, jr, s = _passo(fi, 26, 38, 18, 10)
    return {
        "Hips": ((2, 3.5 * s, 4 * s), (0, 0, -0.015 + 0.012 * math.cos(2 * fi))),
        "Spine": ((1, 0, -2 * s), None),
        "Spine2": ((1.5, -2 * s, -3 * s), None),
        "Head": ((-2, 0, 1.5 * s), None),
        "UpperLeg_L": ((pl, 0, 0), None),
        "UpperLeg_R": ((pr, 0, 0), None),
        "LowerLeg_L": ((jl, 0, 0), None),
        "LowerLeg_R": ((jr, 0, 0), None),
        "Foot_L": ((-0.55 * (pl + jl), 0, 0), None),
        "Foot_R": ((-0.55 * (pr + jr), 0, 0), None),
        "UpperArm_L": ((-18 * s, 2, 0), None),
        "UpperArm_R": ((18 * s, -2, 0), None),
        "LowerArm_L": ((-10 - 5 * max(0.0, -s), 0, 0), None),
        "LowerArm_R": ((-10 - 5 * max(0.0, s), 0, 0), None),
    }


def curva_correr(f, n):
    fi = 2 * math.pi * f / n
    pl, pr, jl, jr, s = _passo(fi, 42, 62, 30, 55)
    return {
        "Hips": ((12, 5 * s, 6 * s), (0, 0, -0.02 + 0.02 * math.cos(2 * fi))),
        "Spine": ((4, 0, -3 * s), None),
        "Spine2": ((5, -3 * s, -4 * s), None),
        "Head": ((-9, 0, 0), None),
        "UpperLeg_L": ((pl, 0, 0), None),
        "UpperLeg_R": ((pr, 0, 0), None),
        "LowerLeg_L": ((jl, 0, 0), None),
        "LowerLeg_R": ((jr, 0, 0), None),
        "Foot_L": ((-0.5 * (pl + jl) - 8, 0, 0), None),
        "Foot_R": ((-0.5 * (pr + jr) - 8, 0, 0), None),
        "UpperArm_L": ((-30 * s - 8, 2, 0), None),
        "UpperArm_R": ((30 * s - 8, -2, 0), None),
        "LowerArm_L": ((-55, 0, 0), None),
        "LowerArm_R": ((-55, 0, 0), None),
    }


def curva_pular(f, n):
    t = f / n  # 0..1: agacha, estica, pose aérea, amortecida
    if t < 0.15:
        k = t / 0.15
    elif t < 0.3:
        k = 1 - (t - 0.15) / 0.15
    else:
        k = 0
    ar = math.sin(2 * math.pi * max(0.0, (t - 0.3) / 0.7))
    return {
        "Hips": ((8 * k + 6, 0, 0), (0, 0, -0.16 * k + 0.05 * (1 if 0.3 <= t < 0.8 else 0))),
        "Spine2": ((8 * k + 4, 0, 0), None),
        "Head": ((-6 * k - 4, 0, 0), None),
        "UpperLeg_L": ((30 * k + 18 + 6 * ar, 0, 3), None),
        "UpperLeg_R": ((26 * k + 10 - 6 * ar, 0, -3), None),
        "LowerLeg_L": ((-50 * k - 42, 0, 0), None),
        "LowerLeg_R": ((-50 * k - 30, 0, 0), None),
        "Foot_L": ((20 * k + 15, 0, 0), None),
        "Foot_R": ((20 * k + 15, 0, 0), None),
        "UpperArm_L": ((-25 * k + 130 * (1 - k) + 8 * ar, 15, 0), None),
        "UpperArm_R": ((-25 * k + 130 * (1 - k) - 8 * ar, -15, 0), None),
        "LowerArm_L": ((-20, 0, 0), None),
        "LowerArm_R": ((-20, 0, 0), None),
    }


def curva_sentar(f, n):
    fi = 2 * math.pi * f / n
    s = math.sin(fi)
    return {
        "Hips": ((-4, 0, 0), (0, 0, -0.01)),
        "Spine": ((-2, 0, 0), None),
        "Spine2": ((1.2 * s, 0, 0), None),
        "Head": ((2, 0, 0), None),
        "UpperLeg_L": ((78, 0, 4), None),
        "UpperLeg_R": ((78, 0, -4), None),
        "LowerLeg_L": ((-82, 0, 0), None),
        "LowerLeg_R": ((-82, 0, 0), None),
        "Foot_L": ((8, 0, 0), None),
        "Foot_R": ((8, 0, 0), None),
        "UpperArm_L": ((28, 0, 8), None),
        "UpperArm_R": ((28, 0, -8), None),
        "LowerArm_L": ((-22, 0, 0), None),
        "LowerArm_R": ((-22, 0, 0), None),
    }


def curva_soco(f, n):
    t = f / n
    if t < 0.25:
        giro, braco, coto = 12 * (t / 0.25), -15 * (t / 0.25), -80 * (t / 0.25)
    elif t < 0.45:
        k = (t - 0.25) / 0.20
        giro, braco, coto = 12 - 26 * k, -15 + 103 * k, -80 + 77 * k
    elif t < 0.65:
        giro, braco, coto = -14, 88, -3
    else:
        k = (t - 0.65) / 0.35
        giro, braco, coto = -14 * (1 - k), 88 * (1 - k), -3 * (1 - k)
    return {
        "Hips": ((0, 0, giro * 0.4), None),
        "Spine1": ((0, 0, giro * 0.4), None),
        "Spine2": ((0, 0, giro * 0.6), None),
        "Head": ((0, 0, -giro * 0.5), None),
        "UpperArm_R": ((braco, 0, -10), None),
        "LowerArm_R": ((coto, 0, 0), None),
        "UpperArm_L": ((-10, 0, 12), None),
        "LowerArm_L": ((-50, 0, 0), None),
    }


def curva_acenar(f, n):
    fi = 2 * math.pi * f / n
    sobe = min(1.0, f / (n * 0.15)) * (1 if f < n * 0.85 else max(0.0, (n - f) / (n * 0.15)))
    aceno = math.sin(3 * fi)
    return {
        "Spine2": ((0, -4 * sobe, -3 * sobe), None),
        "Head": ((0, -6 * sobe, 0), None),
        "UpperArm_R": ((0, 140 * sobe, 0), None),
        "LowerArm_R": ((-20 * sobe + 22 * aceno * sobe, 0, -14 * aceno * sobe), None),
        "UpperArm_L": ((0, -6 * sobe, 0), None),
        "LowerArm_L": ((-10, 0, 0), None),
    }


ANIMACOES = [
    ("Idle", 90, curva_idle),
    ("Walk", 32, curva_andar),
    ("Run", 20, curva_correr),
    ("Jump", 40, curva_pular),
    ("Sit", 60, curva_sentar),
    ("Punch", 16, curva_soco),
    ("Wave", 40, curva_acenar),
]


# ---------------- render de validação ----------------

def configurar_camera():
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x = 512
    scene.render.resolution_y = 640
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
