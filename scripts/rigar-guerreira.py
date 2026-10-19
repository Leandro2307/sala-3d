# Rig da guerreira: importa o FBX, separa cabelo e capa, cria o esqueleto e pinta os pesos (as
# regras ficam em guerreira_comum.py). Grava o .blend e renders de validação dos pesos.
#   blender -b --factory-startup --python scripts/rigar-guerreira.py -- <fbx> <pasta-saida>
import bpy, sys, os, math, colorsys
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guerreira_comum import (importar, vertices_mundo, classificar, detectar_seios,
                             construir_armadura, pesar, folha)

argv = sys.argv[sys.argv.index("--") + 1:]
fbx_path, out_dir = argv[0], os.path.abspath(argv[1])

malha = importar(fbx_path)
pts, nrm = vertices_mundo(malha)
cabelo, capa, braco = classificar(malha, pts, nrm)
print("REGIOES cabelo", int(cabelo.sum()), "capa", int(capa.sum()), "de", len(pts))
seios = detectar_seios(pts, ~cabelo & ~capa)
print("SEIOS", {k: tuple(round(c, 3) for c in v) for k, v in seios.items()})
arm = construir_armadura(seios)
W = pesar(malha, arm, pts, nrm, cabelo, capa, braco, seios)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "guerreira.blend"))

# --- validação: cada vértice com a cor do osso de maior peso (mistura com o segundo) ---
me = malha.data
nomes = [g.name for g in malha.vertex_groups]
cores = [colorsys.hsv_to_rgb((i * 0.618) % 1.0, 0.85, 0.95) for i in range(len(nomes))]
ca = me.color_attributes.new("osso", 'FLOAT_COLOR', 'POINT')
for vi in range(len(pts)):
    ordem = W[vi].argsort()[::-1]
    a, b = ordem[0], ordem[1]
    t = W[vi, b] / max(1e-9, W[vi, a] + W[vi, b])
    c = [x * (1 - t) + y * t for x, y in zip(cores[a], cores[b])]
    ca.data[vi].color = (*c, 1)
cena = bpy.context.scene
cena.render.engine = 'BLENDER_WORKBENCH'
cena.display.shading.light = 'FLAT'
cena.display.shading.color_type = 'VERTEX'
cena.render.resolution_x, cena.render.resolution_y = 400, 600
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cena.collection.objects.link(cam)
cena.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.0
imgs = []
for nome, ang in (("frente", 0), ("lado", math.pi / 2), ("costas", math.pi), ("lado2", -math.pi / 2)):
    cam.location = (4 * math.sin(ang), -4 * math.cos(ang), 0.95)
    cam.rotation_euler = (Vector((0, 0, 0.95)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cena.render.filepath = os.path.join(out_dir, f"pesos-{nome}.png")
    bpy.ops.render.render(write_still=True)
    imgs.append(cena.render.filepath)
folha(imgs, 4, os.path.join(out_dir, "pesos.png"))
me.color_attributes.remove(me.color_attributes["osso"])
print("RIG_OK")
