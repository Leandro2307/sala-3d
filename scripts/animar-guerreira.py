# Animações da guerreira: keyframeia as curvas (guerreira_comum.py) no esqueleto, renderiza uma
# folha de quadros de cada clipe para conferir e exporta o GLB.
#   blender -b --factory-startup --python scripts/animar-guerreira.py -- <blend> <glb> <pasta-saida> [so-render]
import bpy, sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guerreira_comum import Rig, ANIMACOES, vertices_mundo, configurar_camera, renderizar, folha

argv = sys.argv[sys.argv.index("--") + 1:]
blend_path, out_glb, out_dir = argv[0], argv[1], os.path.abspath(argv[2])
so_render = len(argv) > 3 and argv[3] == "so-render"

bpy.ops.wm.open_mainfile(filepath=blend_path)
arm = next(ob for ob in bpy.data.objects if ob.type == "ARMATURE")
malha = next(ob for ob in bpy.data.objects if ob.type == "MESH")
cena = bpy.context.scene
cena.render.fps = 30

rig = Rig(arm)
rig.medir_solado(vertices_mundo(malha)[0])
print("BASE_Z", round(rig.base_z, 4))

# folha de cada clipe: 8 quadros de 3/4 de frente em cima, os mesmos de lado embaixo
cam = configurar_camera()
alvo = (0, 0, 0.95)
for nome, quadros, curva in ANIMACOES:
    imgs = [[], []]
    for i in range(8):
        f = round(i * quadros / 8)
        rig.aplicar(arm, *curva(f, quadros))
        for linha, ang in ((0, 0.45), (1, 1.5708)):
            caminho = os.path.join(out_dir, f"q-{nome.lower()}-{linha}-{i}.png")
            renderizar(cam, alvo, 3.4, ang, caminho)
            imgs[linha].append(caminho)
    folha(imgs[0] + imgs[1], 8, os.path.join(out_dir, f"anim-{nome.lower()}.png"))
    for c in imgs[0] + imgs[1]:
        os.remove(c)
for pb in arm.pose.bones:
    pb.matrix_basis.identity()
if so_render:
    print("RENDER_OK")
    sys.exit(0)

ad = arm.animation_data or arm.animation_data_create()
for pb in arm.pose.bones:
    pb.rotation_mode = "QUATERNION"
for nome, quadros, curva in ANIMACOES:
    acao = bpy.data.actions.new(nome)
    ad.action = acao
    for f in range(quadros + 1):
        basis = rig.calcular(*curva(f % quadros, quadros))
        for pb in arm.pose.bones:
            pb.matrix_basis = basis[pb.name]
            pb.keyframe_insert("location", frame=f, group=pb.name)
            pb.keyframe_insert("rotation_quaternion", frame=f, group=pb.name)
    fcurves = []
    for camada in getattr(acao, "layers", []):
        for tira in camada.strips:
            for cb in getattr(tira, "channelbags", []):
                fcurves.extend(cb.fcurves)
    for fc in fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    trilha = ad.nla_tracks.new()
    trilha.name = nome
    trilha.strips.new(nome, 0, acao)
    trilha.mute = True
    ad.action = None
    print("ACAO", nome, quadros, "quadros")

for pb in arm.pose.bones:
    pb.matrix_basis.identity()

kwargs = dict(filepath=out_glb, export_format="GLB", export_yup=True,
              export_animations=True, export_animation_mode="ACTIONS",
              export_optimize_animation_size=True, export_skins=True,
              export_def_bones=False, export_image_format="AUTO",
              export_rest_position_armature=True)
try:
    bpy.ops.export_scene.gltf(**kwargs)
except TypeError:
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", export_yup=True)
print("GLB_OK", os.path.getsize(out_glb))
