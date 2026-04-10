(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))o(a);new MutationObserver(a=>{for(const i of a)if(i.type==="childList")for(const s of i.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&o(s)}).observe(document,{childList:!0,subtree:!0});function r(a){const i={};return a.integrity&&(i.integrity=a.integrity),a.referrerPolicy&&(i.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?i.credentials="include":a.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function o(a){if(a.ep)return;a.ep=!0;const i=r(a);fetch(a.href,i)}})();const at=`// shader.wgsl
// The uniform struct and vertex pipeline are already wired up for you.
// model_id values:
//   0 = Flat implemented
//   1 = Gouraud TODO
//   2 = Phong TODO
//   3 = Blinn-Phong TODO
//
// Useful WGSL built-ins:
//   normalize(v) — returns unit vector
//   dot(a, b) — scalar dot product
//   reflect(I, N) — reflects incident vector I around normal N
//   max(a, b) — component-wise max
//   pow(base, exp) — power function
//   dpdx(v), dpdy(v) — screen-space partial derivatives (fragment stage only)
//   cross(a, b)— cross product

// ── Uniform block
struct Uniforms {
  mvp        : mat4x4<f32>,  // Model-View-Projection matrix
  model      : mat4x4<f32>,  // Model matrix (object -> world space)
  normalMat  : mat4x4<f32>,  // transpose(inverse(model)) — keeps normals correct under scale

  lightPos   : vec3<f32>,    // Light position in world space
  _p0        : f32,

  lightColor : vec3<f32>,    // RGB light colour
  _p1        : f32,

  ambient    : f32,          // Ka — ambient coefficient
  diffuse    : f32,          // Kd — diffuse coefficient
  specular   : f32,          // Ks — specular coefficient
  shininess  : f32,          // n  — specular exponent 

  camPos     : vec3<f32>,    // Camera position in world space
  model_id   : u32,          // Which lighting model to use (0–3)

  objectColor : vec3<f32>,   // Base colour of the object
  time        : f32,         // Elapsed seconds
};

@group(0) @binding(0) var<uniform> u : Uniforms;

// ── Vertex shader I/O 
struct VSIn {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) uv       : vec2<f32>,
  @location(3) bary_cords       : vec3<f32>,
};

struct VSOut {
  @builtin(position) clipPos : vec4<f32>,
  @location(0) worldPos      : vec3<f32>,   // fragment position in world space
  @location(1) worldNormal   : vec3<f32>,   // interpolated world-space normal
  @location(2) uv            : vec2<f32>,
  // TODO (Gouraud): compute and store the light colour here in vs_main,
  // then read it back in fs_main instead of re-computing lighting per fragment
  @location(3) gouraudColor  : vec3<f32>,
  @location(4) bary_cords    : vec3<f32>,
};

//Flat shading
// Flat shading uses ONE normal per triangle face instead of per-vertex normals.
// We derive it in the fragment shader using screen-space derivatives:
//   dpdx(p) = how much world-position changes horizontally across one pixel
//   dpdy(p) = how much world-position changes vertically
//   cross(dpdx, dpdy) gives the face normal pointing toward the camera.

fn flatShading(fragWorldPos: vec3<f32>) -> vec3<f32> {
  // Derive the face normal from position derivatives
  let dx    = dpdx(fragWorldPos);
  let dy    = dpdy(fragWorldPos);
  let faceN = normalize(cross(dx, dy));

  // ── Standard lighting terms
  let L = normalize(u.lightPos - fragWorldPos);  // direction TO the light
  let V = normalize(u.camPos   - fragWorldPos);  // direction TO the camera

  // Ambient: constant low-level light so dark side isn't pure black
  let ambientC = u.ambient * u.lightColor;

  // Diffuse: Lambertian — cos(angle between N and L), clamped to [0,1]
  let NdotL    = max(dot(faceN, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  // Specular: Phong reflection — angle between reflected light and view direction
  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, faceN);                              // perfect mirror direction
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

// ── TODO 1 of 3: Gouraud shading
// Called ONCE PER VERTEX in vs_main, not per fragment.
fn gouraudLighting(N: vec3<f32>, vertWorldPos: vec3<f32>) -> vec3<f32> {
  // Normarl per vertex
  let normal = normalize(N);

  let L = normalize(u.lightPos - vertWorldPos);
  let V = normalize(u.camPos - vertWorldPos);

  let ambientC = u.ambient * u.lightColor;

  let NdotL = max(dot(normal, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, normal);
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

// ── TODO 2 of 3: Phong shading 
// Called ONCE PER FRAGMENT in fs_main.
fn phongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {
  // Normarl per fragment
  let normal = normalize(N);

  let L = normalize(u.lightPos - fragWorldPos);
  let V = normalize(u.camPos - fragWorldPos);

  let ambientC = u.ambient * u.lightColor;

  let NdotL = max(dot(normal, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, normal);
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

// ── TODO 3 of 3: Blinn-Phong shading 
// Called ONCE PER FRAGMENT in fs_main.
fn blinnPhongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {
  let normal = normalize(N);

  let L = normalize(u.lightPos - fragWorldPos);
  let V = normalize(u.camPos - fragWorldPos);

  let ambientC = u.ambient * u.lightColor;

  let NdotL = max(dot(normal, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
     let H= normalize(L + V);
    let RdotV = max(dot(normal, H), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

fn normalsLightning(N: vec3<f32>) -> vec3<f32> {
  // Remap de [-1,1] → [0,1] para visualizar como color RGB
  return N * 0.5 + vec3<f32>(0.5);
}

fn wireframeLightning(bary_cords: vec3<f32>) -> vec3<f32> {
  let d = min(bary_cords.x, min(bary_cords.y, bary_cords.z));
  let line = 1.0 - smoothstep(0.0, 0.02, d);  // suaviza el edge
  return mix(vec3<f32>(0.0), vec3<f32>(1.0), line);
}

// fn depthLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {

// }

// fn uvCoordsLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {

// }



// ── Vertex shader
// Transforms geometry to clip space and prepares interpolated data for the fragment shader.
@vertex
fn vs_main(input: VSIn) -> VSOut {
  var out: VSOut;

  let worldPos4    = u.model    * vec4<f32>(input.position, 1.0);
  let worldNormal4 = u.normalMat * vec4<f32>(input.normal, 0.0);

  out.clipPos     = u.mvp * vec4<f32>(input.position, 1.0);
  out.worldPos    = worldPos4.xyz;
  out.worldNormal = normalize(worldNormal4.xyz);
  out.uv          = input.uv;
  out.bary_cords = input.bary_cords;

  // TODO (Gouraud): call gouraudLighting() here and store the result.
  // When model_id == 1u, compute lighting per vertex so the fragment shader can just read out.gouraudColor directly without any extra work.
  if u.model_id == 1u {
    out.gouraudColor = gouraudLighting(out.worldNormal, out.worldPos);
  } else {
    out.gouraudColor = vec3<f32>(0.0);
  }

  return out;
}

// ── Fragment shader
// Dispatches to the correct lighting function based on model_id
// Do NOT need to modify the switch
@fragment
fn fs_main(input: VSOut) -> @location(0) vec4<f32> {
  var color: vec3<f32>;
  let N = normalize(input.worldNormal);  // smooth interpolated normal

  switch u.model_id {
    case 0u: {
      // Flat — already done, use as reference
      color = flatShading(input.worldPos);
    }
    case 1u: {
      // Gouraud — colour was computed per-vertex and interpolated by GPU
      color = input.gouraudColor;
    }
    case 2u: {
      // Phong — implement phongLighting() above
      color = phongLighting(N, input.worldPos);
    }
    case 4u: {
      color = normalsLightning(N);
    }
    case 5u: {
      color = wireframeLightning(input.bary_cords);
    }
    // case 4u: {
    //   color = wireframeLighting(N, input.worldPos);
    // }
    // case 5u: {
    //   color = depthLighting(N, input.worldPos);
    // }
    // case 5u: {
    //   color = uvCoordsLighting(N, input.worldPos);
    // }
    default: {
      // Blinn-Phong — implement blinnPhongLighting() above
      color = blinnPhongLighting(N, input.worldPos);
    }
  }

  return vec4<f32>(color, 1.0);
}`,d={add(n,t){return[n[0]+t[0],n[1]+t[1],n[2]+t[2]]},sub(n,t){return[n[0]-t[0],n[1]-t[1],n[2]-t[2]]},scale(n,t){return[n[0]*t,n[1]*t,n[2]*t]},dot(n,t){return n[0]*t[0]+n[1]*t[1]+n[2]*t[2]},cross(n,t){return[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]]},normalize(n){const t=Math.hypot(n[0],n[1],n[2])||1;return[n[0]/t,n[1]/t,n[2]/t]},barycentric(n,t,r,o){const a=this.sub(t,n),i=this.sub(r,n),s=this.sub(o,n),c=this.dot(a,a),l=this.dot(a,i),h=this.dot(i,i),u=this.dot(s,a),x=this.dot(s,i),b=c*h-l*l,w=(h*u-l*x)/b,L=(c*x-l*u)/b;return[1-w-L,w,L]}},m={identity(){const n=new Float32Array(16);return n[0]=1,n[5]=1,n[10]=1,n[15]=1,n},multiply(n,t){const r=new Float32Array(16);for(let o=0;o<4;o++)for(let a=0;a<4;a++)r[o*4+a]=n[0+a]*t[o*4+0]+n[4+a]*t[o*4+1]+n[8+a]*t[o*4+2]+n[12+a]*t[o*4+3];return r},transpose(n){const t=new Float32Array(16);for(let r=0;r<4;r++)for(let o=0;o<4;o++)t[o*4+r]=n[r*4+o];return t},invert(n){const t=new Float32Array(16),r=n[0],o=n[1],a=n[2],i=n[3],s=n[4],c=n[5],l=n[6],h=n[7],u=n[8],x=n[9],b=n[10],w=n[11],L=n[12],g=n[13],M=n[14],y=n[15],P=r*c-o*s,C=r*l-a*s,E=r*h-i*s,S=o*l-a*c,R=o*h-i*c,V=a*h-i*l,I=u*g-x*L,T=u*M-b*L,D=u*y-w*L,U=x*M-b*g,F=x*y-w*g,G=b*y-w*M;let v=P*G-C*F+E*U+S*D-R*T+V*I;return v?(v=1/v,t[0]=(c*G-l*F+h*U)*v,t[1]=(l*D-s*G-h*T)*v,t[2]=(s*F-c*D+h*I)*v,t[3]=(c*T-s*U-l*I)*v,t[4]=(a*F-o*G-i*U)*v,t[5]=(r*G-a*D+i*T)*v,t[6]=(o*D-r*F-i*I)*v,t[7]=(r*U-o*T+a*I)*v,t[8]=(g*V-M*R+y*S)*v,t[9]=(M*E-L*V-y*C)*v,t[10]=(L*R-g*E+y*P)*v,t[11]=(g*C-L*S-M*P)*v,t[12]=(b*R-x*V-w*S)*v,t[13]=(u*V-b*E+w*C)*v,t[14]=(x*E-u*R-w*P)*v,t[15]=(u*S-x*C+b*P)*v,t):m.identity()},normalMatrix(n){return m.transpose(m.invert(n))},translation(n,t,r){const o=m.identity();return o[12]=n,o[13]=t,o[14]=r,o},scaling(n,t,r){const o=m.identity();return o[0]=n,o[5]=t,o[10]=r,o},rotationX(n){const t=Math.cos(n),r=Math.sin(n),o=m.identity();return o[5]=t,o[6]=r,o[9]=-r,o[10]=t,o},rotationY(n){const t=Math.cos(n),r=Math.sin(n),o=m.identity();return o[0]=t,o[2]=-r,o[8]=r,o[10]=t,o},rotationZ(n){const t=Math.cos(n),r=Math.sin(n),o=m.identity();return o[0]=t,o[1]=r,o[4]=-r,o[5]=t,o},rotationAxis(n,t){const[r,o,a]=d.normalize(n),i=Math.cos(t),s=Math.sin(t),c=1-i,l=m.identity();return l[0]=c*r*r+i,l[1]=c*r*o+s*a,l[2]=c*r*a-s*o,l[3]=0,l[4]=c*r*o-s*a,l[5]=c*o*o+i,l[6]=c*o*a+s*r,l[7]=0,l[8]=c*r*a+s*o,l[9]=c*o*a-s*r,l[10]=c*a*a+i,l[11]=0,l[12]=0,l[13]=0,l[14]=0,l[15]=1,l},perspective(n,t,r,o){const a=1/Math.tan(n/2),i=new Float32Array(16);return i[0]=a/t,i[5]=a,i[10]=o/(r-o),i[11]=-1,i[14]=o*r/(r-o),i},lookAt(n,t,r){const o=d.normalize(d.sub(n,t)),a=d.normalize(d.cross(r,o)),i=d.cross(o,a),s=new Float32Array(16);return s[0]=a[0],s[4]=a[1],s[8]=a[2],s[12]=-d.dot(a,n),s[1]=i[0],s[5]=i[1],s[9]=i[2],s[13]=-d.dot(i,n),s[2]=o[0],s[6]=o[1],s[10]=o[2],s[14]=-d.dot(o,n),s[3]=0,s[7]=0,s[11]=0,s[15]=1,s}};class lt{position=[0,.8,6];yaw=-Math.PI/2;pitch=0;moveSpeed=3.5;turnSpeed=1.9;clampPitch(){const t=Math.PI/2-.01;this.pitch>t&&(this.pitch=t),this.pitch<-t&&(this.pitch=-t)}getForward(){const t=Math.cos(this.pitch);return d.normalize([Math.cos(this.yaw)*t,Math.sin(this.pitch),Math.sin(this.yaw)*t])}getViewMatrix(){const t=this.getForward(),r=d.add(this.position,t);return m.lookAt(this.position,r,[0,1,0])}update(t,r){t.has("ArrowLeft")&&(this.yaw-=this.turnSpeed*r),t.has("ArrowRight")&&(this.yaw+=this.turnSpeed*r),t.has("ArrowUp")&&(this.pitch+=this.turnSpeed*r),t.has("ArrowDown")&&(this.pitch-=this.turnSpeed*r),this.clampPitch();const o=this.getForward(),a=d.normalize(d.cross(o,[0,1,0])),i=[0,1,0],s=this.moveSpeed*r;t.has("w")&&(this.position=d.add(this.position,d.scale(o,s))),t.has("s")&&(this.position=d.add(this.position,d.scale(o,-s))),t.has("a")&&(this.position=d.add(this.position,d.scale(a,-s))),t.has("d")&&(this.position=d.add(this.position,d.scale(a,s))),t.has("q")&&(this.position=d.add(this.position,d.scale(i,-s))),t.has("e")&&(this.position=d.add(this.position,d.scale(i,s)))}scroll(t,r){const o=this.getForward(),a=this.moveSpeed*r;t.deltaY>0?(console.log("Scrolled down"),this.position=d.add(this.position,d.scale(o,-a))):t.deltaY<0&&(this.position=d.add(this.position,d.scale(o,a)),console.log("Scrolled up")),t.deltaX!==0&&console.log(`Scrolled horizontally by: ${e.deltaX}`)}}const f={modelId:0,ambient:.12,diffuse:.75,specular:.6,shininess:32,lightX:3,lightY:4,lightZ:3,autoRotLight:!0,objectColor:"#4a9eff",lightColor:"#ffffff"};function H(n){const t=parseInt(n.slice(1),16);return[(t>>16&255)/255,(t>>8&255)/255,(t&255)/255]}const ct={0:"Flat: face normal derived from dpdx/dpdy — one colour per triangle.",1:"Gouraud: lighting per vertex in vs_main, interpolated across face.",2:"Phong: smooth normals interpolated per pixel, lighting in fs_main.",3:"Blinn-Phong: like Phong but uses half-vector H=normalize(L+V).",4:"Normals: Normal Buffer: world-space normals encoded as RGB — R=X G=Y B=Z remapped [-1,1]→[0,1].",5:"Wireframe: barycentric edge detection with hidden surface, "};function z(n,t,r,o,a,i){return`
  <div class="slider-row">
    <span class="slider-label">${t}</span>
    <input type="range" id="${n}" min="${r}" max="${o}" step="${a}" value="${i}">
    <span class="slider-val" id="${n}-val">${i}</span>
  </div>`}function dt(n,t){const r=document.createElement("div");r.id="guiL",r.innerHTML=`
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
</div>`,document.body.appendChild(r);const o=document.createElement("div");o.id="gui",o.innerHTML=`
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
    ${z("ambient","Ambient (Ka)",0,1,.01,f.ambient)}
    ${z("diffuse","Diffuse (Kd)",0,1,.01,f.diffuse)}
    ${z("specular","Specular (Ks)",0,1,.01,f.specular)}
    ${z("shininess","Shininess (n)",1,256,1,f.shininess)}
  </div>

  <div class="gui-section">
    <div class="gui-label">Light Position</div>
    ${z("lightX","X",-8,8,.1,f.lightX)}
    ${z("lightY","Y",-8,8,.1,f.lightY)}
    ${z("lightZ","Z",-8,8,.1,f.lightZ)}
    <label class="checkbox-row">
      <input type="checkbox" id="autoRotLight" checked> Auto-rotate light
    </label>
  </div>

  <div class="gui-section">
    <div class="gui-label">Colors</div>
    <div class="color-row"><span>Object</span><input type="color" id="objectColor" value="${f.objectColor}"></div>
    <div class="color-row"><span>Light</span> <input type="color" id="lightColor"  value="${f.lightColor}"></div>
  </div>
</div>`,document.body.appendChild(o);const a=()=>{document.getElementById("model-desc").textContent=ct[f.modelId]};a(),document.querySelectorAll(".model-btn").forEach(i=>{i.addEventListener("click",()=>{f.modelId=Number(i.dataset.id),document.querySelectorAll(".model-btn").forEach(s=>s.classList.remove("active")),i.classList.add("active"),a()})}),document.querySelectorAll(".shape-btn").forEach(i=>{i.addEventListener("click",()=>{const s=i.dataset.shape;document.querySelectorAll(".shape-btn").forEach(c=>c.classList.remove("active")),i.classList.add("active"),document.getElementById("shape-desc").textContent=s==="sphere"?"UV sphere — smooth normals.":"Cube — flat normals per face.",n(s)})}),document.getElementById("obj-upload").addEventListener("change",i=>{const s=i.target.files?.[0];s&&t(s)}),["ambient","diffuse","specular","shininess","lightX","lightY","lightZ"].forEach(i=>{const s=document.getElementById(i),c=document.getElementById(`${i}-val`);!s||!c||s.addEventListener("input",()=>{f[i]=parseFloat(s.value),c.textContent=s.value})}),document.getElementById("autoRotLight").addEventListener("change",i=>{f.autoRotLight=i.target.checked}),document.getElementById("objectColor").addEventListener("input",i=>{f.objectColor=i.target.value}),document.getElementById("lightColor").addEventListener("input",i=>{f.lightColor=i.target.value})}class ut{currentRotation=m.identity();is_dragging=!1;lastPos=[0,0,0];convertPos_sphere(t,r,o,a){const i=2*t/o-1,s=-(2*r/a)+1,c=i**2+s**2;return c<=1?[i,s,Math.sqrt(1-c)]:d.normalize([i,s,0])}onMouseDown(t,r,o,a){this.is_dragging=!0,this.lastPos=this.convertPos_sphere(t,r,o,a)}onMouseMoving(t,r,o,a){if(this.is_dragging==!1)return;const i=this.convertPos_sphere(t,r,o,a),s=d.normalize(d.cross(this.lastPos,i)),c=Math.min(1,Math.max(-1,d.dot(this.lastPos,i))),l=Math.acos(c);l>1e-4&&(this.currentRotation=m.multiply(m.rotationAxis(s,l),this.currentRotation)),this.lastPos=i}onMouseUp(){this.is_dragging=!1}getMatrix(){return this.currentRotation}}if(!navigator.gpu)throw new Error("WebGPU not supported");const N=document.querySelector("#gfx-main");if(!N)throw new Error("Canvas #gfx-main not found");const J=await navigator.gpu.requestAdapter();if(!J)throw new Error("No GPU adapter found");const O=await J.requestDevice(),Q=N.getContext("webgpu"),tt=navigator.gpu.getPreferredCanvasFormat();let $=null;function et(){N.width=Math.max(1,Math.floor(window.innerWidth*devicePixelRatio)),N.height=Math.max(1,Math.floor(window.innerHeight*devicePixelRatio)),Q.configure({device:O,format:tt,alphaMode:"premultiplied"}),$?.destroy(),$=O.createTexture({size:[N.width,N.height],format:"depth24plus",usage:GPUTextureUsage.RENDER_ATTACHMENT})}et();window.addEventListener("resize",et);function ft(){const n=[{n:[0,0,1],verts:[[-1,-1,1,0,1],[1,-1,1,1,1],[1,1,1,1,0],[-1,-1,1,0,1],[1,1,1,1,0],[-1,1,1,0,0]]},{n:[0,0,-1],verts:[[1,-1,-1,0,1],[-1,-1,-1,1,1],[-1,1,-1,1,0],[1,-1,-1,0,1],[-1,1,-1,1,0],[1,1,-1,0,0]]},{n:[-1,0,0],verts:[[-1,-1,-1,0,1],[-1,-1,1,1,1],[-1,1,1,1,0],[-1,-1,-1,0,1],[-1,1,1,1,0],[-1,1,-1,0,0]]},{n:[1,0,0],verts:[[1,-1,1,0,1],[1,-1,-1,1,1],[1,1,-1,1,0],[1,-1,1,0,1],[1,1,-1,1,0],[1,1,1,0,0]]},{n:[0,1,0],verts:[[-1,1,1,0,1],[1,1,1,1,1],[1,1,-1,1,0],[-1,1,1,0,1],[1,1,-1,1,0],[-1,1,-1,0,0]]},{n:[0,-1,0],verts:[[-1,-1,-1,0,1],[1,-1,-1,1,1],[1,-1,1,1,0],[-1,-1,-1,0,1],[1,-1,1,1,0],[-1,-1,1,0,0]]}],t=[];for(const r of n)for(let o=0;o<2;o++){const a=[[1,0,0],[0,1,0],[0,0,1]];for(let i=0;i<3;i++){const s=r.verts[o*3+i];t.push(s[0],s[1],s[2]),t.push(...r.n),t.push(s[3],s[4]),t.push(...a[i])}}return new Float32Array(t)}function ht(n,t){const r=[];for(let a=0;a<n;a++){const i=2*Math.PI*a/n,s=2*Math.PI*(a+1)/n;for(let c=0;c<t;c++){const l=2*Math.PI*c/t,h=2*Math.PI*(c+1)/t,u=(g,M)=>[.5*Math.sin(g)*Math.cos(M),.5*Math.sin(g)*Math.sin(M),.5*Math.cos(g),Math.sin(g)*Math.cos(M),Math.sin(g)*Math.sin(M),Math.cos(g),g/Math.PI,M/(2*Math.PI)],x=u(i,l),b=u(i,h),w=u(s,l),L=u(s,h);r.push(...x,1,0,0,...b,0,1,0,...w,0,0,1),r.push(...b,1,0,0,...L,0,1,0,...w,0,0,1)}}return new Float32Array(r)}let _,X;function nt(n){const t=n==="cube"?ft():ht(64,64);_?.destroy(),_=O.createBuffer({size:t.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),O.queue.writeBuffer(_,0,t),X=t.length/11}nt("cube");function pt(n){const t=[],r=[],o=[],a=[];let i=[1/0,1/0,1/0],s=[-1/0,-1/0,-1/0];for(const h of n.split(`
`)){const u=h.trim().split(/\s+/);if(u[0]==="v")t.push([+u[1],+u[2],+u[3]]);else if(u[0]==="vn")r.push([+u[1],+u[2],+u[3]]);else if(u[0]==="vt")o.push([+u[1],+u[2]]);else if(u[0]==="f"){const x=y=>{const[P,C,E]=y.split("/");return{v:+P-1,vt:C?+C-1:null,vn:E?+E-1:null}},b=x(u[1]),w=x(u[2]),L=x(u[3]),g=[b,w,L];let M=null;if(b.vn===null||w.vn===null||L.vn===null){const y=t[b.v],P=t[w.v],C=t[L.v],E=d.sub(P,y),S=d.sub(C,y);M=d.normalize(d.cross(E,S))}for(let y=0;y<g.length;y++){const P=g[y],C=[[1,0,0],[0,1,0],[0,0,1]],E=t[P.v],S=P.vn!==null?r[P.vn]:M,R=P.vt!==null?o[P.vt]:[0,0];a.push(...E,...S,...R,...C[y])}}}for(const h of t)i=[Math.min(i[0],h[0]),Math.min(i[1],h[1]),Math.min(i[2],h[2])],s=[Math.max(s[0],h[0]),Math.max(s[1],h[1]),Math.max(s[2],h[2])];const c=[(i[0]+s[0])/2,(i[1]+s[1])/2,(i[2]+s[2])/2],l=[s[0]-i[0],s[1]-i[1],s[2]-i[2]];return{data:new Float32Array(a),center:c,size:l}}const ot=288,it=O.createBuffer({size:ot,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),Y=new ArrayBuffer(ot),p=new Float32Array(Y),mt=new Uint32Array(Y),K=O.createShaderModule({label:"Lighting Shader",code:at}),st=O.createRenderPipeline({label:"Lighting Pipeline",layout:"auto",vertex:{module:K,entryPoint:"vs_main",buffers:[{arrayStride:44,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32x2"},{shaderLocation:3,offset:32,format:"float32x3"}]}]},fragment:{module:K,entryPoint:"fs_main",targets:[{format:tt}]},primitive:{topology:"triangle-list",cullMode:"back"},depthStencil:{format:"depth24plus",depthWriteEnabled:!0,depthCompare:"less"}}),gt=O.createBindGroup({layout:st.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:it}}]});let W=[0,0,0],j=[1,1,1],q=!1;dt(n=>{q=!1,nt(n)},async n=>{const t=await n.text(),{data:r,center:o,size:a}=pt(t);_?.destroy(),_=O.createBuffer({size:r.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),O.queue.writeBuffer(_,0,r),X=r.length/11,W=o,j=a,q=!0});const B=new lt;B.position=[0,0,5];const Z=new Set;window.addEventListener("keydown",n=>Z.add(n.key));window.addEventListener("keyup",n=>Z.delete(n.key));window.addEventListener("wheel",n=>B.scroll(n,.1));const A=new ut;N.addEventListener("mousedown",n=>{const t=N.getBoundingClientRect();A.onMouseDown(n.clientX-t.left,n.clientY-t.top,t.width,t.height)});N.addEventListener("mousemove",n=>{const t=N.getBoundingClientRect();A.onMouseMoving(n.clientX-t.left,n.clientY-t.top,t.width,t.height)});N.addEventListener("mouseup",()=>A.onMouseUp());N.addEventListener("mouseleave",()=>A.onMouseUp());let k=performance.now();const vt=performance.now();function rt(n){const t=Math.min(.033,(n-k)/1e3);k=n;const r=(n-vt)/1e3;B.update(Z,t);const o=N.width/N.height,a=m.perspective(60*Math.PI/180,o,.1,100),i=B.getViewMatrix();let s=m.identity();if(q){const S=2/Math.max(j[0],j[1],j[2]);s=m.multiply(m.multiply(m.scaling(S,S,S),A.getMatrix()),m.translation(-W[0],-W[1],-W[2]))}else s=A.getMatrix();const c=m.normalMatrix(s),l=m.multiply(m.multiply(a,i),s);let h=f.lightX,u=f.lightY,x=f.lightZ;const[b,w,L]=H(f.objectColor),[g,M,y]=H(f.lightColor);p.set(l,0),p.set(s,16),p.set(c,32),p[48]=h,p[49]=u,p[50]=x,p[51]=0,p[52]=g,p[53]=M,p[54]=y,p[55]=0,p[56]=f.ambient,p[57]=f.diffuse,p[58]=f.specular,p[59]=f.shininess,p[60]=B.position[0],p[61]=B.position[1],p[62]=B.position[2],mt[63]=f.modelId,p[64]=b,p[65]=w,p[66]=L,p[67]=r,O.queue.writeBuffer(it,0,Y);const P=O.createCommandEncoder(),C=P.beginRenderPass({colorAttachments:[{view:Q.getCurrentTexture().createView(),clearValue:{r:.08,g:.08,b:.12,a:1},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:{view:$.createView(),depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}});C.setPipeline(st),C.setBindGroup(0,gt),C.setVertexBuffer(0,_),C.draw(X),C.end(),O.queue.submit([P.finish()]),requestAnimationFrame(rt)}requestAnimationFrame(rt);
