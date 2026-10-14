# Rig da guerreira: importa o FBX, cria o esqueleto, faz a pele (auto weights),
# prende a capa no quadril e cria os ossos de peito com pesos.
import bpy, sys, json, os
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guerreira_comum import (importar, vertices_mundo, detectar_juntas,
                             construir_armadura, aplicar_pose, configurar_camera,
                             renderizar, curva_andar, curva_sentar)

argv = sys.argv[sys.argv.index("--") + 1:]
fbx_path, out_dir = argv[0], argv[1]

malha = importar(fbx_path)
pts = vertices_mundo(malha)
j = detectar_juntas(pts)
print("JUNTAS", json.dumps({k: (list(v) if isinstance(v, Vector) else
                                 [list(a) if a else None for a in v] if isinstance(v, tuple) else v)
                            for k, v in j.items()}, default=str))

arm = construir_armadura(j)

# pele automática (calor de ossos)
bpy.ops.object.select_all(action="DESELECT")
malha.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

# --- capa: a malha é uma ilha só, então acha a capa pela região ---
# (pendurada abaixo da cintura, mais larga que as pernas e os braços)
grupo_quadril = malha.vertex_groups.get("Hips")

def eh_capa(p):
    if p.z >= 1.04:
        return False
    # caneleiras dos antebraços ficam na mesma faixa: nunca são capa
    if 0.86 < p.z < 1.10 and abs(abs(p.x) - 0.235) < 0.085 and abs(p.y + 0.03) < 0.10:
        return False
    return (abs(p.x) > 0.28
            or (abs(p.y) > 0.14 and abs(p.x) > 0.12)
            or (p.y < -0.15 and abs(p.x) > 0.12))

capa = [vi for vi, p in enumerate(pts) if eh_capa(p)]
print("CAPA", len(capa), "verts por região")
grupo_quadril.add(capa, 1.0, "REPLACE")

# --- pesos dos seios ---
me = malha.data
grupo_seio = {}
for lado in ("Breast_L", "Breast_R"):
    grupo_seio[lado] = malha.vertex_groups.get(lado) or malha.vertex_groups.new(name=lado)
ponta = {"Breast_L": j["seio"][0], "Breast_R": j["seio"][1]}
RAIO = 0.11
indices = {g.index: g for g in malha.vertex_groups}
for vi, p in enumerate(pts):
    if not (1.24 <= p.z <= 1.46 and abs(p.x) > 0.02):
        continue
    for lado in ("Breast_L", "Breast_R"):
        if (lado == "Breast_L") != (p.x > 0):
            continue
        d = (p - ponta[lado]).length
        if d >= RAIO:
            continue
        w = (1 - (d / RAIO) ** 2) ** 2 * 0.92
        atuais = {g.group: g.weight for g in me.vertices[vi].groups}
        total = sum(atuais.values())
        if total <= 0:
            continue
        alvo = min(w, 0.92 * total)
        escala = (total - alvo) / total
        for gi, peso in atuais.items():
            indices[gi].add([vi], peso * escala, "REPLACE")
        grupo_seio[lado].add([vi], alvo, "REPLACE")

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "guerreira.blend"))

# --- renders de validação ---
cam = configurar_camera()
alvo = (0, 0, 0.95)
renderizar(cam, alvo, 3.2, 0, os.path.join(out_dir, "rig-rest-front.png"))
renderizar(cam, alvo, 3.2, 1.5708, os.path.join(out_dir, "rig-rest-side.png"))
aplicar_pose(arm, curva_andar(8, 32))
renderizar(cam, alvo, 3.2, 0, os.path.join(out_dir, "rig-walk-front.png"))
renderizar(cam, alvo, 3.2, 1.5708, os.path.join(out_dir, "rig-walk-side.png"))
aplicar_pose(arm, curva_sentar(1, 60))
renderizar(cam, alvo, 3.2, 1.5708, os.path.join(out_dir, "rig-sit-side.png"))
aplicar_pose(arm, {})
print("RIG_OK")
