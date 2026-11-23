// Every copy of a mesh: run it on the selection, and it selects every node in the sector that draws one of
// the selected meshes. An example shipped with REDcode: Copy to My Scripts to change it.
export default {
  name: "Every copy of these meshes",
  description: "Run on the selection: selects every node drawing one of its meshes",
  run(ctx) {
    const meshes = new Set(ctx.selected().map((n) => n.mesh?.toLowerCase()).filter(Boolean));
    if (!meshes.size) {
      ctx.log("Select one or more meshes first, then Run on Selection.");
      return;
    }
    for (const node of ctx.nodes()) if (node.mesh && meshes.has(node.mesh.toLowerCase())) ctx.select(node);
    ctx.log(`${meshes.size} mesh(es)`);
  },
};
