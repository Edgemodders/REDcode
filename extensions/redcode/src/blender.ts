// Edit in Blender (REDcode issue #7, for EDGEfab): finds Blender and writes the script Blender runs to
// open a GLB, save it as a .blend beside it, and export the GLB again on every save, which REDcode
// watches and re-imports. No VS Code imports. Unverified in Blender itself: not installed on the dev PC.

import * as fs from "node:fs";
import * as path from "node:path";
import { steamLibraries } from "./gameFinder";

/** blender.exe: the configured path (the exe or its folder), else the newest under Blender Foundation, else a Steam install. */
export function findBlender(configured: string | undefined, steam: string | undefined): string | undefined {
  const exe = (p: string) => (p.toLowerCase().endsWith(".exe") ? p : path.join(p, "blender.exe"));
  if (configured) return fs.existsSync(exe(configured)) ? exe(configured) : undefined;
  const foundation = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Blender Foundation");
  try {
    const versions = fs.readdirSync(foundation).filter((d) => fs.existsSync(path.join(foundation, d, "blender.exe")));
    // "Blender 4.2" before "Blender 3.6": newest first by the numbers in the name.
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    if (versions[0]) return path.join(foundation, versions[0], "blender.exe");
  } catch {
    // no Blender Foundation folder
  }
  for (const library of steamLibraries(steam)) {
    const p = path.join(library, "steamapps", "common", "Blender", "blender.exe");
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * The script Blender runs: `blender --python <script> -- <glb> <blend>`. It opens the GLB in an empty
 * scene, saves it as the .blend, and from then on exports the GLB on every save, with normals and
 * tangents (WolvenKit's importer needs both) and the object names kept, which carry WolvenKit's
 * submesh_NN_LOD_N names. A keyword this Blender's exporter does not know falls back to the defaults.
 *
 * The glTF import and export run with a window and a 3D view in their context: after
 * read_factory_settings the script's context has none, and the importer builds a skinned mesh's
 * armature in edit mode, which then fails ("context is incorrect"). Reported by a modder, with the
 * override as the fix. With no window (Blender in the background) they run as they are; a Blender
 * older than 3.2, with no temp_override, gets the old dictionary override.
 */
export const BlenderScript = `# REDcode: Edit in Blender. Written by REDcode; each save exports the GLB for REDcode to import.
import sys
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
glb, blend = args[0], args[1]

def redcode_context():
    # A window, its screen, a 3D view and its main region, for operators that need them.
    wm = bpy.context.window_manager or (bpy.data.window_managers[0] if bpy.data.window_managers else None)
    for win in (wm.windows if wm else []):
        screen = win.screen
        if not screen or not screen.areas:
            continue
        area = next((a for a in screen.areas if a.type == "VIEW_3D"), screen.areas[0])
        ctx = {"window": win, "screen": screen, "area": area}
        region = next((r for r in area.regions if r.type == "WINDOW"), None)
        if region:
            ctx["region"] = region
        return ctx
    return None

def redcode_run(op, **kwargs):
    ctx = redcode_context()
    if ctx is None:
        return op(**kwargs)
    if hasattr(bpy.context, "temp_override"):
        with bpy.context.temp_override(**ctx):
            return op(**kwargs)
    return op(ctx, **kwargs)

bpy.ops.wm.read_factory_settings(use_empty=True)
redcode_run(bpy.ops.import_scene.gltf, filepath=glb)
bpy.ops.wm.save_as_mainfile(filepath=blend)

def redcode_export(*_):
    try:
        redcode_run(bpy.ops.export_scene.gltf, filepath=glb, export_format="GLB", export_normals=True, export_tangents=True)
    except TypeError:
        redcode_run(bpy.ops.export_scene.gltf, filepath=glb, export_format="GLB")
    print("REDcode: exported " + glb, flush=True)

bpy.app.handlers.save_post.append(redcode_export)
print("REDcode: editing " + glb + " as " + blend, flush=True)
`;

/** Writes the script into dir and returns its path. */
export function writeBlenderScript(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "redcode_edit_in_blender.py");
  fs.writeFileSync(file, BlenderScript);
  return file;
}
