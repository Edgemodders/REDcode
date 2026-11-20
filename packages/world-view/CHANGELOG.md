# Changelog

What changed in each release of `@edgemodders/world-view`. Changes are grouped as **New**, **Changed**, **Fixed** and **Other**.

## Unreleased

**New**

- **The host half:** `createSectorLoader`, `sectorsOver`, `sectorsNear`, `texturedGlb`, `entityGlb`, and the axis helpers. It reads a sector through REDbridge's `sector.nodes`, exports each unique mesh once into a cache folder, and hands over every placement in glTF axes with its streaming distance.
- **The page half:** `createWorldView`.
  - **Drawing:** one instanced draw per GLB primitive, markers for things with no mesh, and the caller's own objects in the same scene.
  - **Picking and showing:** picking by each placement's box, highlight, hide and ghost.
  - **View:** culling by streaming distance as a switch, a flying camera, and colour by mesh or by material.
- **The stage:** an environment for reflections, tone mapping, and a light with brightness and a camera or fixed mode (REDcode issue #31, https://github.com/Edgemodders/REDcode/issues/31).
