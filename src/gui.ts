export const gui = {
  modelId:      0,
  ambient:      0.12,
  diffuse:      0.75,
  specular:     0.60,
  shininess:    32,
  lightX:       3.0,
  lightY:       4.0,
  lightZ:       3.0,
  autoRotLight: true,
  objectColor:  "#4a9eff",
  lightColor:   "#ffffff",
};

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function updateLightDisplay(lx: number, lz: number) {
  (document.getElementById("lightX") as HTMLInputElement).value = lx.toFixed(1);
  document.getElementById("lightX-val")!.textContent = lx.toFixed(1);
  (document.getElementById("lightZ") as HTMLInputElement).value = lz.toFixed(1);
  document.getElementById("lightZ-val")!.textContent = lz.toFixed(1);
}

const MODEL_DESCS: Record<number, string> = {
  0: "Flat: face normal derived from dpdx/dpdy — one colour per triangle.",
  1: "Gouraud: lighting per vertex in vs_main, interpolated across face.",
  2: "Phong: smooth normals interpolated per pixel, lighting in fs_main.",
  3: "Blinn-Phong: like Phong but uses half-vector H=normalize(L+V).",
  4: "Normals: Normal Buffer: world-space normals encoded as RGB — R=X G=Y B=Z remapped [-1,1]→[0,1].",
  5: "Wireframe: barycentric edge detection with hidden surface, ",
};

function slider(id: string, label: string, min: number, max: number, step: number, val: number) {
  return `
  <div class="slider-row">
    <span class="slider-label">${label}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
    <span class="slider-val" id="${id}-val">${val}</span>
  </div>`;
}

// onShapeChange : called when user picks cube/sphere
// onObjLoad     : called with the File when user picks a .obj
export function initGUI(
  onShapeChange: (shape: "cube" | "sphere") => void,
  onObjLoad:     (file: File) => void,
) {
  //  Left panel
  const left = document.createElement("div");
  left.id = "guiL";
  left.innerHTML = `
<div class="gui-panel">
  <div class="gui-title">Pipeline</div>

  <div class="gui-section">
    <div class="gui-label">Load OBJ</div>
    <input type="file" id="obj-upload" accept=".obj" class="file-input">
  </div>

  <div class="gui-section">
    <div class="gui-label">Load Texture</div>
    <input type="file" id="texture-upload" accept="image/*" class="file-input">
  </div>

  <div class="gui-section">
    <div class="gui-label">Geometry</div>
    <div class="model-btns">
      <button class="shape-btn active" data-shape="cube">Cube</button>
      <button class="shape-btn" data-shape="sphere">Sphere</button>
    </div>
    <div class="model-desc" id="shape-desc">Cube is provided as a reference.</div>
  </div>

  <div class="gui-hint">Drag to rotate · Scroll to zoom<br>WASD/QE move · Arrows look</div>
</div>`;
  document.body.appendChild(left);

  // Right panel 
  const right = document.createElement("div");
  right.id = "gui";
  right.innerHTML = `
<div class="gui-panel">
  <div class="gui-title">Lighting</div>

  <div class="gui-section">
    <div class="gui-label">Shading Model</div>
    <div class="model-btns">
      <button class="model-btn active" data-id="0">Flat</button>
      <button class="model-btn" data-id="1">Gouraud</button>
      <button class="model-btn" data-id="2">Phong</button>
      <button class="model-btn" data-id="3">Blinn-Phong</button>
      <button class="model-btn" data-id="4">Normals</button>
      <button class="model-btn" data-id="5">Wireframe</button>
    </div>
    <div class="model-desc" id="model-desc"></div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Material</div>
    ${slider("ambient",   "Ambient (Ka)",  0, 1,   0.01, gui.ambient)}
    ${slider("diffuse",   "Diffuse (Kd)",  0, 1,   0.01, gui.diffuse)}
    ${slider("specular",  "Specular (Ks)", 0, 1,   0.01, gui.specular)}
    ${slider("shininess", "Shininess (n)", 1, 256, 1,    gui.shininess)}
  </div>

  <div class="gui-section">
    <div class="gui-label">Light Position</div>
    ${slider("lightX", "X", -8, 8, 0.1, gui.lightX)}
    ${slider("lightY", "Y", -8, 8, 0.1, gui.lightY)}
    ${slider("lightZ", "Z", -8, 8, 0.1, gui.lightZ)}
    <label class="checkbox-row">
      <input type="checkbox" id="autoRotLight" checked> Auto-rotate light
    </label>
  </div>

  <div class="gui-section">
    <div class="gui-label">Colors</div>
    <div class="color-row"><span>Object</span><input type="color" id="objectColor" value="${gui.objectColor}"></div>
    <div class="color-row"><span>Light</span> <input type="color" id="lightColor"  value="${gui.lightColor}"></div>
  </div>
</div>`;
  document.body.appendChild(right);


  // model description
  const updateDesc = () => {
    document.getElementById("model-desc")!.textContent = MODEL_DESCS[gui.modelId];
  };
  updateDesc();

  // Shading model buttons
  document.querySelectorAll<HTMLButtonElement>(".model-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      gui.modelId = Number(btn.dataset.id);
      document.querySelectorAll(".model-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateDesc();
    });
  });

  // Shape buttons
  document.querySelectorAll<HTMLButtonElement>(".shape-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const shape = btn.dataset.shape as "cube" | "sphere";
      document.querySelectorAll(".shape-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("shape-desc")!.textContent =
        shape === "sphere"
          ? "UV sphere — smooth normals."
          : "Cube — flat normals per face.";
      onShapeChange(shape);
    });
  });

  // OBJ upload
  document.getElementById("obj-upload")!.addEventListener("change", e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) onObjLoad(file);
  });

  // Sliders
  (["ambient", "diffuse", "specular", "shininess", "lightX", "lightY", "lightZ"] as const)
    .forEach(id => {
      const el    = document.getElementById(id) as HTMLInputElement | null;
      const valEl = document.getElementById(`${id}-val`);
      if (!el || !valEl) return;
      el.addEventListener("input", () => {
        (gui as Record<string, number>)[id] = parseFloat(el.value);
        valEl.textContent = el.value;
      });
    });

  // Checkbox
  (document.getElementById("autoRotLight") as HTMLInputElement)
    .addEventListener("change", e => {
      gui.autoRotLight = (e.target as HTMLInputElement).checked;
    });

  // Color pickers
  (document.getElementById("objectColor") as HTMLInputElement)
    .addEventListener("input", e => { gui.objectColor = (e.target as HTMLInputElement).value; });
  (document.getElementById("lightColor") as HTMLInputElement)
    .addEventListener("input", e => { gui.lightColor  = (e.target as HTMLInputElement).value; });
}