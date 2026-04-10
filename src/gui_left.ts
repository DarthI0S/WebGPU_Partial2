

// Shared GUI state  (read by the render loop in main.ts)
export const guiL = {
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

// Colour utility
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// Model metadata
const MODEL_DESCS: Record<number, string> = {
  0: "Flat: face normal derived from dpdx/dpdy — one colour per triangle, hard faceted edges.",
  1: "Gouraud: lighting computed per vertex in vs_main, interpolated across the face. Implement gouraudLighting() in shader.wgsl.",
  2: "Phong: smooth normals interpolated per pixel, full lighting in fs_main. Implement phongLighting() in shader.wgsl.",
  3: "Blinn-Phong: like Phong but uses half-vector H=normalize(L+V) for specular. Implement blinnPhongLighting() in shader.wgsl.",
};

// Update the auto-rotating light display
export function updateLightDisplay(lx: number, lz: number) {
  (document.getElementById("lightX") as HTMLInputElement).value = lx.toFixed(1);
  document.getElementById("lightX-val")!.textContent = lx.toFixed(1);
  (document.getElementById("lightZ") as HTMLInputElement).value = lz.toFixed(1);
  document.getElementById("lightZ-val")!.textContent = lz.toFixed(1);
}

// HTML helpers
function slider(id: string, label: string, min: number, max: number, step: number, val: number) {
  return `
  <div class="slider-row">
    <span class="slider-label">${label}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
    <span class="slider-val" id="${id}-val">${val}</span>
  </div>`;
}


// initGUI — build the overlay and wire up all events
// onShapeChange is called with the new shape whenever the user switches
export function initGUIL(onShapeChange: (shape: "cube" | "sphere") => void) {
  const overlay = document.createElement("div");
  overlay.id = "guiL";
  overlay.innerHTML = `
<div class="gui-panel" id="panel-left">
  <div class="gui-title">Pipeline</div>
  <div class="gui-section">
    <div class="gui-label">Add textutre</div>
    <input type="file" id="texture-upload" accept="image/*" class="text-input">

    <div class="gui-label" style="margin-top:6px">Add OBJ Model</div>
    <input type="file" id="obj-upload" accept=".obj" class="file-input" value="">
  </div>
  <div class="gui-section">
    <div class="gui-label">Render Mode (global)</div>
    <div class="btn-row">
      <button class="mode-btn" data-id="0">Gouraud</button>
      <button class="mode-btn active" data-id="1">Phong</button>
      <button class="mode-btn" data-id="2">Normals</button>
    </div>

    <div class="mode-desc" id="mode-desc"></div>
  </div>
  <div class="gui-section">
    <div class="gui-label">Global Light Color</div>
    <div class="color-row">
      <span>Light</span><input type="color" id="g-lightColor" value="#ffffff">
    </div>
  </div>
  <div class="gui-hint">No selection: drag orbits camera<br>Object selected: drag rotates object<br>Scroll: zoom toward target</div>
</div>

<div class="gui-panel" id="panel-right">
  <div class="gui-title">Scene</div>
  <div id="object-list"></div>
  <div class="btn-row" style="margin-top:6px">
    <button id="btn-deselect">Deselect</button>
    <button id="btn-remove">Remove</button>
  </div>

    <div class="inspector-sub-label">Texture (spherical UV)</div>
    <input type="file" id="tex-upload" accept="image/*" class="file-input">
    <label class="checkbox-row"><input type="checkbox" id="use-texture"> Use texture</label>
  </div>
</div>`;
  document.body.appendChild(overlay);

  // Model description
  function updateDesc() {
    document.getElementById("mode-desc")!.textContent = MODEL_DESCS[guiL.modelId];
  }
  updateDesc();

  // Shading model buttons
  document.querySelectorAll<HTMLButtonElement>(".model-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      guiL.modelId = Number(btn.dataset.id);
      document.querySelectorAll(".model-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateDesc();
    });
  });

  

  // Sliders
  (["ambient", "diffuse", "specular", "shininess", "lightX", "lightY", "lightZ"] as const).forEach(id => {
    const el    = document.getElementById(id) as HTMLInputElement;
    const valEl = document.getElementById(`${id}-val`)!;
    el.addEventListener("input", () => {
      (guiL as Record<string, number>)[id] = parseFloat(el.value);
      valEl.textContent = el.value;
    });
  });

  // Checkboxes & colour pickers
  (document.getElementById("autoRotLight") as HTMLInputElement)
    .addEventListener("change", e => { guiL.autoRotLight = (e.target as HTMLInputElement).checked; });

  (document.getElementById("objectColor") as HTMLInputElement)
    .addEventListener("input", e => { guiL.objectColor = (e.target as HTMLInputElement).value; });

  (document.getElementById("lightColor") as HTMLInputElement)
    .addEventListener("input", e => { guiL.lightColor = (e.target as HTMLInputElement).value; });
}
