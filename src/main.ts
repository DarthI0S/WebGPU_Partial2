/// <reference types="@webgpu/types" />

import "./style.css";
import shaderCode from "./shader.wgsl?raw";
import { Camera } from "./camera";
import { mat4, vec3 } from "./math";
import type { Vec3 } from "./math";
import { gui, hexToRgb, initGUI, updateLightDisplay } from "./gui";
import { Arcball } from "./arcball";

// ── WebGPU init ──────────────────────────────────────────────────────────────
if (!navigator.gpu) throw new Error("WebGPU not supported");

const canvas = document.querySelector("#gfx-main") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #gfx-main not found");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("No GPU adapter found");

const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu")!;
const format  = navigator.gpu.getPreferredCanvasFormat();

let depthTexture: GPUTexture | null = null;

function resize() {
  canvas.width  = Math.max(1, Math.floor(window.innerWidth  * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * devicePixelRatio));
  context.configure({ device, format, alphaMode: "premultiplied" });
  depthTexture?.destroy();
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}
resize();
window.addEventListener("resize", resize);

//format: [x, y, z,  nx, ny, nz,  u, v] 8 datos, coor, norm, u, v

function generateCube(): Float32Array {
  const faces: Array<{ n: Vec3; verts: number[][] }> = [
    { n: [ 0,  0,  1], verts: [[-1,-1, 1,0,1],[1,-1, 1,1,1],[1, 1, 1,1,0],[-1,-1, 1,0,1],[1, 1, 1,1,0],[-1, 1, 1,0,0]] },
    { n: [ 0,  0, -1], verts: [[ 1,-1,-1,0,1],[-1,-1,-1,1,1],[-1, 1,-1,1,0],[1,-1,-1,0,1],[-1, 1,-1,1,0],[1, 1,-1,0,0]] },
    { n: [-1,  0,  0], verts: [[-1,-1,-1,0,1],[-1,-1, 1,1,1],[-1, 1, 1,1,0],[-1,-1,-1,0,1],[-1, 1, 1,1,0],[-1, 1,-1,0,0]] },
    { n: [ 1,  0,  0], verts: [[ 1,-1, 1,0,1],[ 1,-1,-1,1,1],[ 1, 1,-1,1,0],[1,-1, 1,0,1],[1, 1,-1,1,0],[1, 1, 1,0,0]] },
    { n: [ 0,  1,  0], verts: [[-1, 1, 1,0,1],[ 1, 1, 1,1,1],[ 1, 1,-1,1,0],[-1, 1, 1,0,1],[1, 1,-1,1,0],[-1, 1,-1,0,0]] },
    { n: [ 0, -1,  0], verts: [[-1,-1,-1,0,1],[ 1,-1,-1,1,1],[ 1,-1, 1,1,0],[-1,-1,-1,0,1],[1,-1, 1,1,0],[-1,-1, 1,0,0]] },
  ];
  const data: number[] = [];
  for (const face of faces) {
    // Cada face.verts tiene 6 vértices = 2 triángulos
    for (let t = 0; t < 2; t++) {          // dos triángulos por cara
      const bary: Vec3[] = [[1,0,0],[0,1,0],[0,0,1]];
      for (let i = 0; i < 3; i++) {
        const v = face.verts[t * 3 + i];
        data.push(v[0], v[1], v[2]);       // position
        data.push(...face.n);              // normal
        data.push(v[3], v[4]);             // uv
        data.push(...bary[i]);             // bary(wireframelightning)
      }
    }
  }
  return new Float32Array(data);
}

function generateSphere(stacks: number, slices: number): Float32Array {
  const data: number[] = [];
  const r = 0.5;
  for (let lat = 0; lat < stacks; lat++) {
    const t1 = (2 * Math.PI * lat)       / stacks;
    const t2 = (2 * Math.PI * (lat + 1)) / stacks;
    for (let lon = 0; lon < slices; lon++) {
      const p1 = (2 * Math.PI * lon)       / slices;
      const p2 = (2 * Math.PI * (lon + 1)) / slices;
      const v = (theta: number, phi: number) => [
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(theta),
        Math.sin(theta) * Math.cos(phi),  // normal x
        Math.sin(theta) * Math.sin(phi),  // normal y
        Math.cos(theta),                  // normal z
        theta / Math.PI,                  // u
        phi / (2 * Math.PI),              // v
      ];
      const v1 = v(t1, p1), v2 = v(t1, p2), v3 = v(t2, p1), v4 = v(t2, p2);
      data.push(...v1, 1,0,0,  ...v2, 0,1,0,  ...v3, 0,0,1);
      data.push(...v2, 1,0,0,  ...v4, 0,1,0,  ...v3, 0,0,1);  
    }
  }
  return new Float32Array(data);
}

let activeShape: "cube" | "sphere" = "cube";
let vertexBuffer: GPUBuffer;
let vertexCount: number;

function buildVertexBuffer(shape: "cube" | "sphere"): void {
  const data = shape === "cube" ? generateCube() : generateSphere(64, 64);
  vertexBuffer?.destroy();
  vertexBuffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(vertexBuffer, 0, data);
  vertexCount = data.length /11;//8+3
}
buildVertexBuffer("cube");

//lectura del archivo .obj (texto para convertirlo en info)
function parseObject(object : string) : {data : Float32Array, center : Vec3, size : Vec3} {
  
    const positions: Vec3[] = [];
    const normals: Vec3[] = [];
    const uvs: [number, number][] = [];
    const vertexData : number[] = []
    
    //dimensiones del obj
    // let min : Vec3 = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    // let max : Vec3 = [-Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER];
    let min : Vec3 = [Infinity, Infinity, Infinity];
    let max : Vec3 = [-Infinity, -Infinity, -Infinity];

    for(const line of object.split("\n")){//para que no lea saltos de linea
        const parts = line.trim().split(/\s+/); //para eliminar espacios y convertir en vector

        if(parts[0] === "v"){
          positions.push([+parts[1], +parts[2], +parts[3]]);
        }
        else if(parts[0] === "vn"){
          normals.push([+parts[1], +parts[2], +parts[3]]);
        }
        else if(parts[0] === "vt"){
          uvs.push([+parts[1], +parts[2]]);
        }

        else if(parts[0] === "f"){

          const parseVertex = (chara: string) => {
            const [v, vt, vn] = chara.split("/");
            return {
              v: +v - 1,
              vt: vt ? +vt - 1 : null,
              vn: vn ? +vn - 1 : null
            };
          };

          const v0 = parseVertex(parts[1]);
          const v1 = parseVertex(parts[2]);
          const v2 = parseVertex(parts[3]);

          const vertices = [v0, v1, v2];

          let normalCalculada: Vec3 | null = null;

          if (v0.vn === null || v1.vn === null || v2.vn === null) {
            const p0 = positions[v0.v];
            const p1 = positions[v1.v];
            const p2 = positions[v2.v];

            const AB = vec3.sub(p1, p0);
            const AC = vec3.sub(p2, p0);
            normalCalculada = vec3.normalize(vec3.cross(AB, AC));
          }

          for (let i = 0; i < vertices.length; i++) {
            const v = vertices[i];
            const bary: Vec3[] = [[1,0,0],[0,1,0],[0,0,1]];
            const pos    = positions[v.v];
            const normal = v.vn !== null ? normals[v.vn] : normalCalculada!;
            const uv     = v.vt !== null ? uvs[v.vt]     : [0, 0];
            vertexData.push(...pos, ...normal, ...uv, ...bary[i]); // ← bary[i]
          }
        }
      }

    for(const pos of positions){
         min = [Math.min(min[0], pos[0]), Math.min(min[1], pos[1]), Math.min(min[2], pos[2])];
         max = [Math.max(max[0], pos[0]), Math.max(max[1], pos[1]), Math.max(max[2], pos[2])];
      }
      const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];

      const size: Vec3 = [max[0]-min[0], max[1]-min[1], max[2]-min[2]];

      return {data : new Float32Array(vertexData), center, size };
};


// Uniform buffer
// Offsets (floats):  0=mvp(16) 16=model(16) 32=normM(16)
//   48=lightPos(3)+pad 52=lightColor(3)+pad
//   56=ambient 57=diffuse 58=specular 59=shininess
//   60=camPos(3) 63=modelId(u32)
//   64=objectColor(3) 67=time
const UNIFORM_SIZE = 288;
const uniformBuffer = device.createBuffer({
  size: UNIFORM_SIZE,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const uArrayBuf = new ArrayBuffer(UNIFORM_SIZE);
const uData     = new Float32Array(uArrayBuf);
const uData32   = new Uint32Array(uArrayBuf);

const shader = device.createShaderModule({ label: "Lighting Shader", code: shaderCode });
const pipeline = device.createRenderPipeline({
  label: "Lighting Pipeline",
  layout: "auto",
  vertex: {
    module: shader,
    entryPoint: "vs_main",
    buffers: [{
      arrayStride: 11 * 4, //se le suma el vector para el wireframe
      attributes: [
        { shaderLocation: 0, offset: 0,     format: "float32x3" }, // position
        { shaderLocation: 1, offset: 3 * 4, format: "float32x3" }, // normal
        { shaderLocation: 2, offset: 6 * 4, format: "float32x2" }, // uv
        { shaderLocation: 3, offset: 8 * 4,  format: "float32x3" }, // bary 

      ],
    }],
  },
  fragment: { module: shader, entryPoint: "fs_main", targets: [{ format }] },
  primitive: { topology: "triangle-list", cullMode: "back" },
  depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
});
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
});

let objCenter: Vec3 = [0, 0, 0];
let objSize:   Vec3 = [1, 1, 1];
let objLoaded = false;


initGUI(
  // shapeChange
  shape => {
    activeShape = shape;
    objLoaded = false;
    buildVertexBuffer(shape);
  },
  // objLoad
  async (file: File) => {
    const text = await file.text();
    const { data, center, size } = parseObject(text);
    vertexBuffer?.destroy();
    vertexBuffer = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, data);
    vertexCount = data.length / 11;//8+3
    objCenter = center;
    objSize   = size;
    objLoaded = true;
  }
);

// camera
const camera = new Camera();
camera.position = [0, 0, 5];
const keys = new Set<string>();
window.addEventListener("keydown", e => keys.add(e.key));
window.addEventListener("keyup",   e => keys.delete(e.key));
window.addEventListener("wheel",   e => camera.scroll(e as WheelEvent, 0.1));

// arcball
const arcball = new Arcball();
canvas.addEventListener("mousedown", e => {
  const b = canvas.getBoundingClientRect();
  arcball.onMouseDown(e.clientX - b.left, e.clientY - b.top, b.width, b.height);
});
canvas.addEventListener("mousemove", e => {
  const b = canvas.getBoundingClientRect();
  arcball.onMouseMoving(e.clientX - b.left, e.clientY - b.top, b.width, b.height);
});
canvas.addEventListener("mouseup",   () => arcball.onMouseUp());
canvas.addEventListener("mouseleave",() => arcball.onMouseUp());

let lastTime    = performance.now();
const startTime = performance.now();

function frame(now: number) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime  = now;
  const t   = (now - startTime) / 1000;

  camera.update(keys, dt);

  const aspect = canvas.width / canvas.height;
  const proj   = mat4.perspective((60 * Math.PI) / 180, aspect, 0.1, 100);
  const view   = camera.getViewMatrix();

  // Model matrix: centrar + rotar (arcball) + escalar si hay obj cargado
  let model = mat4.identity();
  if (objLoaded) {
    const maxDim = Math.max(objSize[0], objSize[1], objSize[2]);
    const scale  = 2.0 / maxDim;
    model = mat4.multiply(
      mat4.multiply(mat4.scaling(scale, scale, scale), arcball.getMatrix()),
      mat4.translation(-objCenter[0], -objCenter[1], -objCenter[2])
    );
  } else {
    model = arcball.getMatrix();
  }

  const normM = mat4.normalMatrix(model);
  const mvp   = mat4.multiply(mat4.multiply(proj, view), model);

  let lx = gui.lightX, ly = gui.lightY, lz = gui.lightZ;
  // if (gui.autoRotLight) {
  //   lx = Math.cos(t * 0.8) * 4.5;
  //   lz = Math.sin(t * 0.8) * 4.5;
  //   updateLightDisplay(lx, lz);
  // }

  const [or, og, ob] = hexToRgb(gui.objectColor);
  const [lr, lg, lb] = hexToRgb(gui.lightColor);

  uData.set(mvp,   0);
  uData.set(model, 16);
  uData.set(normM, 32);
  uData[48] = lx; uData[49] = ly; uData[50] = lz; uData[51] = 0;
  uData[52] = lr; uData[53] = lg; uData[54] = lb; uData[55] = 0;
  uData[56] = gui.ambient; uData[57] = gui.diffuse; uData[58] = gui.specular; uData[59] = gui.shininess;
  uData[60] = camera.position[0]; uData[61] = camera.position[1]; uData[62] = camera.position[2];
  uData32[63] = gui.modelId;
  uData[64] = or; uData[65] = og; uData[66] = ob;
  uData[67] = t;

  device.queue.writeBuffer(uniformBuffer, 0, uArrayBuf);

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.08, g: 0.08, b: 0.12, a: 1 },
      loadOp: "clear", storeOp: "store",
    }],
    depthStencilAttachment: {
      view: depthTexture!.createView(),
      depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store",
    },
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertexCount);
  pass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);