// Raise short streaming distances: sets every streaming distance under 45 m to 90 m. REDcode shows the
// changes first; Apply makes them one edit, which one Undo takes back. Values change only in a project's
// copy of the sector. An example shipped with REDcode: Copy to My Scripts to change it.
export default {
  name: "Raise short streaming distances",
  description: "Sets streaming distances under 45 m to 90 m",
  visit(node, ctx) {
    if (node.streamingDistance < 45) {
      ctx.select(node);
      node.set("streamingDistance", 90);
    }
  },
};
