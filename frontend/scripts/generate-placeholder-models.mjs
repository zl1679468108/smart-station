/**
 * 生成驿站 3D 占位 GLB（纯 Node，不依赖 FileReader/浏览器 API）
 * 运行：node scripts/generate-placeholder-models.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/models');

function concat(buffers) {
  return Buffer.concat(buffers);
}

function align4(buf) {
  const pad = (4 - (buf.length % 4)) % 4;
  if (!pad) return buf;
  return Buffer.concat([buf, Buffer.alloc(pad, 0x20)]); // JSON pad with spaces; BIN with 0 later
}

function align4Bin(buf) {
  const pad = (4 - (buf.length % 4)) % 4;
  if (!pad) return buf;
  return Buffer.concat([buf, Buffer.alloc(pad, 0)]);
}

/** 轴对齐盒子：中心 (cx,cy,cz)，尺寸 (w,h,d) */
function boxVertices(cx, cy, cz, w, h, d) {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  // 8 corners
  const c = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  // 6 faces, 2 tris each, with flat normals
  const faces = [
    { idx: [0, 1, 2, 0, 2, 3], n: [0, 0, -1] }, // -Z
    { idx: [5, 4, 7, 5, 7, 6], n: [0, 0, 1] }, // +Z
    { idx: [4, 0, 3, 4, 3, 7], n: [-1, 0, 0] }, // -X
    { idx: [1, 5, 6, 1, 6, 2], n: [1, 0, 0] }, // +X
    { idx: [3, 2, 6, 3, 6, 7], n: [0, 1, 0] }, // +Y
    { idx: [4, 5, 1, 4, 1, 0], n: [0, -1, 0] }, // -Y
  ];
  const positions = [];
  const normals = [];
  const indices = [];
  let vi = 0;
  for (const f of faces) {
    for (const i of f.idx) {
      positions.push(...c[i]);
      normals.push(...f.n);
      indices.push(vi++);
    }
  }
  return { positions, normals, indices };
}

function mergeMeshes(parts) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let base = 0;
  for (const p of parts) {
    const { positions: pos, normals: nor, indices: idx } = boxVertices(
      p.x,
      p.y,
      p.z,
      p.w,
      p.h,
      p.d,
    );
    const r = p.r ?? 0.7;
    const g = p.g ?? 0.7;
    const b = p.b ?? 0.75;
    const vertCount = pos.length / 3;
    positions.push(...pos);
    normals.push(...nor);
    for (let i = 0; i < vertCount; i++) colors.push(r, g, b);
    for (const i of idx) indices.push(i + base);
    base += vertCount;
  }
  return { positions, normals, colors, indices };
}

function buildGlb(parts) {
  const mesh = mergeMeshes(parts);
  const pos = Float32Array.from(mesh.positions);
  const nor = Float32Array.from(mesh.normals);
  const col = Float32Array.from(mesh.colors);
  const idx = Uint16Array.from(mesh.indices);

  const posBuf = Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength);
  const norBuf = Buffer.from(nor.buffer, nor.byteOffset, nor.byteLength);
  const colBuf = Buffer.from(col.buffer, col.byteOffset, col.byteLength);
  const idxBuf = Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength);

  // layout: pos | nor | col | idx  (each 4-byte aligned)
  let offset = 0;
  const chunks = [];
  const place = (buf) => {
    const start = offset;
    chunks.push(buf);
    offset += buf.length;
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad, 0));
      offset += pad;
    }
    return { start, length: buf.length };
  };

  const posInfo = place(posBuf);
  const norInfo = place(norBuf);
  const colInfo = place(colBuf);
  const idxInfo = place(idxBuf);
  const bin = concat(chunks);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    min[0] = Math.min(min[0], mesh.positions[i]);
    min[1] = Math.min(min[1], mesh.positions[i + 1]);
    min[2] = Math.min(min[2], mesh.positions[i + 2]);
    max[0] = Math.max(max[0], mesh.positions[i]);
    max[1] = Math.max(max[1], mesh.positions[i + 1]);
    max[2] = Math.max(max[2], mesh.positions[i + 2]);
  }

  const gltf = {
    asset: { version: '2.0', generator: 'smart-station-placeholder' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 },
            indices: 3,
            mode: 4,
            material: 0,
          },
        ],
      },
    ],
    materials: [
      {
        name: 'pbr',
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0.15,
          roughnessFactor: 0.65,
        },
        doubleSided: true,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: pos.length / 3,
        type: 'VEC3',
        max,
        min,
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: nor.length / 3,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5126,
        count: col.length / 3,
        type: 'VEC3',
      },
      {
        bufferView: 3,
        componentType: 5123,
        count: idx.length,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: posInfo.start, byteLength: posInfo.length, target: 34962 },
      { buffer: 0, byteOffset: norInfo.start, byteLength: norInfo.length, target: 34962 },
      { buffer: 0, byteOffset: colInfo.start, byteLength: colInfo.length, target: 34962 },
      { buffer: 0, byteOffset: idxInfo.start, byteLength: idxInfo.length, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  };

  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  json = align4(json);
  const binAligned = align4Bin(bin);

  const totalLength = 12 + 8 + json.length + 8 + binAligned.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // glTF
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(json.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // JSON

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binAligned.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // BIN

  return concat([header, jsonChunkHeader, json, binChunkHeader, binAligned]);
}

function makeShelf({ w, h, d, layers, accent }) {
  const parts = [];
  const post = 0.08;
  const boardT = 0.05;
  const frame = { r: 0.58, g: 0.64, b: 0.72 };
  const board = { r: 0.88, g: 0.91, b: 0.94 };
  const acc = accent || { r: 1, g: 0.42, b: 0 };
  // posts
  for (const [x, z] of [
    [-w / 2 + post / 2, -d / 2 + post / 2],
    [w / 2 - post / 2, -d / 2 + post / 2],
    [-w / 2 + post / 2, d / 2 - post / 2],
    [w / 2 - post / 2, d / 2 - post / 2],
  ]) {
    parts.push({ x, y: h / 2, z, w: post, h, d: post, ...frame });
  }
  for (let i = 0; i <= layers; i++) {
    const y = (i / layers) * (h - boardT) + boardT / 2;
    parts.push({ x: 0, y, z: 0, w, h: boardT, d, ...board });
  }
  parts.push({ x: 0, y: h / 2, z: -d / 2 + 0.03, w: w - 0.12, h: h - 0.1, d: 0.05, r: 0.8, g: 0.84, b: 0.88 });
  parts.push({ x: -w / 2 + 0.03, y: h / 2, z: 0, w: 0.05, h: h - 0.1, d: d - 0.12, ...acc });
  return parts;
}

function makeDoor() {
  const g = { r: 0.06, g: 0.73, b: 0.51 };
  return [
    { x: -0.95, y: 1.1, z: 0, w: 0.12, h: 2.2, d: 0.12, ...g },
    { x: 0.95, y: 1.1, z: 0, w: 0.12, h: 2.2, d: 0.12, ...g },
    { x: 0, y: 2.15, z: 0, w: 2.0, h: 0.12, d: 0.14, ...g },
    { x: 0, y: 0.04, z: 0, w: 2.0, h: 0.06, d: 0.32, r: 0.2, g: 0.83, b: 0.6 },
  ];
}

function makeCounter() {
  return [
    { x: 0, y: 0.5, z: 0, w: 2.8, h: 1.0, d: 0.7, r: 0.12, g: 0.45, b: 0.7 },
    { x: 0, y: 1.05, z: 0, w: 3.0, h: 0.08, d: 0.9, r: 0.85, g: 0.9, b: 0.95 },
    { x: 0.7, y: 1.3, z: -0.1, w: 0.45, h: 0.35, d: 0.08, r: 0.1, g: 0.1, b: 0.14 },
    { x: -0.9, y: 0.35, z: 0.35, w: 0.35, h: 0.7, d: 0.35, r: 0.3, g: 0.35, b: 0.4 },
  ];
}

function makeLocker() {
  const parts = [];
  parts.push({ x: 0, y: 1.1, z: 0, w: 2.8, h: 2.2, d: 0.55, r: 0.75, g: 0.8, b: 0.85 });
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      parts.push({
        x: -1.1 + col * 0.55,
        y: 0.35 + row * 0.5,
        z: 0.28,
        w: 0.45,
        h: 0.4,
        d: 0.05,
        r: col % 2 ? 0.9 : 0.2,
        g: col % 2 ? 0.95 : 0.7,
        b: col % 2 ? 0.98 : 0.7,
      });
    }
  }
  return parts;
}

function makeOffice() {
  return [
    { x: 0, y: 0.4, z: -0.2, w: 1.6, h: 0.08, d: 0.8, r: 0.7, g: 0.8, b: 0.9 },
    { x: 0, y: 0.75, z: -0.2, w: 1.5, h: 0.08, d: 0.7, r: 0.55, g: 0.62, b: 0.7 },
    { x: 0, y: 1.05, z: -0.35, w: 0.45, h: 0.3, d: 0.05, r: 0.1, g: 0.1, b: 0.12 },
    { x: 0.5, y: 0.28, z: 0.4, w: 0.45, h: 0.55, d: 0.45, r: 0.4, g: 0.45, b: 0.5 },
    { x: 0, y: 1.0, z: -0.7, w: 2.0, h: 1.2, d: 0.08, r: 0.85, g: 0.9, b: 0.96 },
  ];
}

const jobs = [
  ['shelf-small.glb', makeShelf({ w: 2.0, h: 1.8, d: 1.0, layers: 3, accent: { r: 0.22, g: 0.74, b: 0.97 } })],
  ['shelf-medium.glb', makeShelf({ w: 2.4, h: 2.2, d: 1.2, layers: 4, accent: { r: 0.55, g: 0.36, b: 0.96 } })],
  ['shelf-large.glb', makeShelf({ w: 2.8, h: 2.4, d: 1.4, layers: 5, accent: { r: 0.98, g: 0.45, b: 0.09 } })],
  ['door-main.glb', makeDoor()],
  ['counter.glb', makeCounter()],
  ['locker.glb', makeLocker()],
  ['office.glb', makeOffice()],
];

fs.mkdirSync(outDir, { recursive: true });
for (const [name, parts] of jobs) {
  const glb = buildGlb(parts);
  const file = path.join(outDir, name);
  fs.writeFileSync(file, glb);
  console.log('wrote', name, glb.length, 'bytes');
}
console.log('done ->', outDir);
