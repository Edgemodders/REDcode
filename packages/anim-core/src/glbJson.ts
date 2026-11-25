// The glTF JSON shapes REDcode's animation code reads and writes, with no Node imports, so a page can use them
// (pose.ts, timeline.ts, clipData.ts). glb.ts reads and writes the files in Node.

export interface GlbAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  min?: number[];
  max?: number[];
}

export interface GlbBufferView {
  buffer?: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

export interface GlbNode {
  name?: string;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

export interface GlbChannel {
  sampler: number;
  target: { node?: number; path: string };
}

export interface GlbSampler {
  input: number;
  output: number;
  interpolation?: string;
}

export interface GlbAnimation {
  name?: string;
  channels: GlbChannel[];
  samplers: GlbSampler[];
  extras?: Record<string, unknown>;
}

export interface GlbJson {
  asset: unknown;
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes: GlbNode[];
  skins?: { joints: number[]; skeleton?: number; name?: string; inverseBindMatrices?: number }[];
  meshes?: unknown[];
  animations?: GlbAnimation[];
  accessors?: GlbAccessor[];
  bufferViews?: GlbBufferView[];
  buffers?: { byteLength: number }[];
  [key: string]: unknown;
}
