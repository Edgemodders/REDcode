# Probe A, inside Blender in the background: import a one-clip GLB, raise the left arm in every frame of
# its action, export it again. Prints what Blender kept of the clip's WolvenKit extras.
#   blender -b --python arm.py -- <in.glb> <out.glb>
import sys
import math
import bpy
from mathutils import Quaternion

src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
# The game's clips are 30 fps; Blender's default 24 would resample them.
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src)

arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
print("PROBE armature", arm.name if arm else None, "bones", len(arm.data.bones) if arm else 0)
action = arm.animation_data.action if arm and arm.animation_data else None
print("PROBE action", action.name if action else None, "custom props", list(action.keys()) if action else None)
if not action:
    raise SystemExit("no action")

bone = arm.pose.bones.get("LeftArm")
print("PROBE LeftArm", bone is not None)
start, end = (int(round(v)) for v in action.frame_range)
# 70 degrees about the bone's own Z: an arm hanging at the side swings out and up. Which axis raises it
# depends on the rig's bone roll; the REDcode view shows the result, so any clear change will do.
offset = Quaternion((0.0, 0.0, 1.0), math.radians(70))
scene = bpy.context.scene
scene.frame_start, scene.frame_end = start, end
for f in range(start, end + 1):
    scene.frame_set(f)
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = bone.rotation_quaternion @ offset
    bone.keyframe_insert("rotation_quaternion", frame=f)
print("PROBE keyed frames", start, "to", end)

bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True, export_extras=True)
print("PROBE exported", out)
