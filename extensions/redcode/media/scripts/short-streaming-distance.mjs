// Short streaming distance: selects the nodes the game stops drawing closer than 45 m, which often pop in
// and out in front of the player. An example shipped with REDcode: Copy to My Scripts to change it.
export default {
  name: "Short streaming distance",
  description: "Selects nodes drawn only within 45 m",
  visit(node, ctx) {
    if (node.streamingDistance < 45) ctx.select(node);
  },
};
