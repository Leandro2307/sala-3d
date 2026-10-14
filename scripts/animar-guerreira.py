# Animações da guerreira: keyframeia as curvas no esqueleto e exporta o GLB.
import bpy, sys, os
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from guerreira_comum import (calcular_basis, ANIMACOES, configurar_camera,
                             renderizar, curva_soco, curva_acenar, curva_pular)

argv = sys.argv[sys.argv.index("--") + 1:]
blend_path, out_glb, out_dir = argv[0], argv[1], argv[2]

bpy.ops.wm.open_mainfile(filepath=blend_path)
arm = next(ob for ob in bpy.data.objects if ob.type == "ARMATURE")
cena = bpy.context.scene
cena.render.fps = 30

ad = arm.animation_data or arm.animation_data_create()
for nome, quadros, curva in ANIMACOES:
    acao = bpy.data.actions.new(nome)
    ad.action = acao
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for f in range(quadros + 1):
        basis = calcular_basis(arm, curva(f % quadros, quadros))
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

# limpa a pose
for pb in arm.pose.bones:
    pb.matrix_basis.identity()

# renders de validação: um quadro representativo de cada gesto
cam = configurar_camera()
alvo = (0, 0, 0.95)
for nome, curva, quadro, angulo in [("Punch", curva_soco, 7, 0.5),
                                    ("Wave", curva_acenar, 20, 0.3),
                                    ("Jump", curva_pular, 20, 1.2)]:
    basis = calcular_basis(arm, curva(quadro, 40 if nome != "Punch" else 16))
    for pb in arm.pose.bones:
        pb.matrix_basis = basis[pb.name]
    bpy.context.view_layer.update()
    renderizar(cam, alvo, 3.2, angulo, os.path.join(out_dir, f"anim-{nome.lower()}.png"))
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
