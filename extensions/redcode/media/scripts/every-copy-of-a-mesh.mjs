// Every copy of a mesh: select a mesh or a few in the view, run it, and it selects every node in the sector
// that draws one of them. An example shipped with REDcode: Copy to My Scripts to change it.
export default {
  name: "Every copy of these meshes",
  description: "Selects every node drawing one of the selected meshes",
  run(ctx) {
    const meshes = new Set(ctx.selected().map((n) => n.mesh?.toLowerCase()).filter(Boolean));
    if (!meshes.size) {
      ctx.log("Select one or more meshes in the view first, then run it.");
      return;
    }
    for (const node of ctx.nodes()) if (node.mesh && meshes.has(node.mesh.toLowerCase())) ctx.select(node);
    ctx.log(`${meshes.size === 1 ? "1 mesh" : `${meshes.size} meshes`}`);
  },
};
