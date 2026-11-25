// Miniforge multi-source shadow extension for the pinned LittleJS Render3D plugin.
// Compiled into the SAME lexical scope as littlejs.release.js by device.mjs.
// No global patches or changes to node_modules are required.
//
// Keep the sun's original depth map on texture unit 1; render up to four extra
// spotlight maps into persistent depth attachments on texture units 6..9.
// Spotlight gels, when supplied, occupy units 10..13. WebGL2 guarantees at
// least 16 texture-image units per fragment shader.
const MF_MAX_SHADOW_SPOTS = 4;
const MF_MAX_SHADOW_POINTS = 2;

// LittleJS has only eight dynamic lights and Miniforge can afford at most four
// real-time spotlight depth passes. Choose the lights that actually affect the
// camera's view, rather than requiring users to rank every light manually.
const MF_SHADOW_HYSTERESIS = 1.30;

function mfShadowSphereInFrustum(matrix, center, radius) {
  const m = matrix?.m;
  if (!m || m.length !== 16) return true; // editor/headless startup
  // Same world-space clip planes used by LittleJS's own frustum culling.
  for (let axis = 0; axis < 3; ++axis) for (const sign of [1, -1]) {
    const x = m[3] + sign * m[axis];
    const y = m[7] + sign * m[4 + axis];
    const z = m[11] + sign * m[8 + axis];
    const w = m[15] + sign * m[12 + axis];
    if (x * center.x + y * center.y + z * center.z + w <
        -radius * Math.hypot(x, y, z)) return false;
  }
  return true;
}

function mfSpotImportance(r, entry) {
  const light = entry.light;
  const radius = Math.max(.001, Number(light.radius) || 0);
  const pos = light.getWorldPos3D?.() || light.pos3D || {x:0,y:0,z:0};
  const rawDir = light.getForward3D?.() || {x:0,y:0,z:-1};
  const len = Math.hypot(rawDir.x, rawDir.y, rawDir.z) || 1;
  const forward = {x:rawDir.x/len,y:rawDir.y/len,z:rawDir.z/len};
  const angle = Math.max(.01, Math.min(1.35, Number(light.coneAngle) || .6));
  // The light is limited by BOTH its radius and cone. A bounding sphere keeps
  // partly visible cones; checking only the emitter position would incorrectly
  // discard spotlights illuminating the edge of the view.
  const center = {
    x:pos.x + forward.x*radius*.5,
    y:pos.y + forward.y*radius*.5,
    z:pos.z + forward.z*radius*.5,
  };
  const boundsRadius = radius*Math.max(.5,Math.sqrt(1.25-Math.cos(angle)));
  const inView = mfShadowSphereInFrustum(r.viewProjection, center, boundsRadius);
  if (!inView && !entry.pinned) return -Infinity;
  const camera = r.camera?.pos || {x:0,y:0,z:0};
  const dx = center.x-camera.x,dy=center.y-camera.y,dz=center.z-camera.z;
  const distance = Math.hypot(dx,dy,dz);
  // Nearer, larger and brighter lights have more potential screen impact.
  // Radius is a world-space influence, not merely the light's origin distance.
  const reach = Math.max(0, distance-boundsRadius);
  const proximity = 1/(1+reach/Math.max(radius*.7,1));
  const coverage = boundsRadius/(distance+boundsRadius+.001);
  const col = light.color || {r:1,g:1,b:1,a:1};
  const luminance = Math.max(.05,.2126*(col.r??1)+.7152*(col.g??1)+.0722*(col.b??1));
  const strength = Math.sqrt(Math.max(0,Number(light.intensity)||0)*Math.max(0,col.a??1)*luminance);
  // Favor illumination near the viewing direction, but never discard a light
  // solely because its emitter is behind the camera (its cone may enter view).
  const look = r.cameraForward || {x:0,y:0,z:-1};
  const facing = distance > 1e-4 ? Math.max(0,(dx*look.x+dy*look.y+dz*look.z)/distance) : 1;
  const screenWeight = .75+.25*facing;
  const priority = Math.max(-40,Math.min(40,Number(entry.priority)||0));
  return strength*(.15+coverage)*proximity*screenWeight*Math.pow(1.05,priority);
}

function mfSpotCandidates(r) {
  const entries = Array.isArray(r.multiShadowLights) ? r.multiShadowLights : [];
  const max = Math.min(MF_MAX_SHADOW_SPOTS, Math.max(0, Math.floor(r.multiShadowMax ?? MF_MAX_SHADOW_SPOTS)));
  if (!r.shadows || !max) {
    r.mfPreviousShadowLights = new Set();
    return [];
  }
  const previous = r.mfPreviousShadowLights || new Set();
  const candidates = entries.filter(e => e && e.light && !e.light.destroyed && e.light.intensity > 0 &&
    e.light.color?.a > 0 && e.light.radius > 0 && e.light.coneAngle > 0)
    .map((entry,index) => {
      const importance = mfSpotImportance(r,entry);
      // Source already carrying a shadow stays active until a competitor has
      // a meaningfully higher score. This avoids shadow flicker at thresholds.
      return {entry,index,importance,score:importance*(previous.has(entry.light)?MF_SHADOW_HYSTERESIS:1)};
    })
    .filter(c => Number.isFinite(c.score))
    .sort((a,b) => Number(!!b.entry.pinned)-Number(!!a.entry.pinned) ||
      b.score-a.score || a.index-b.index);
  const selected = candidates.slice(0,max).map(c=>c.entry);
  r.mfPreviousShadowLights = new Set(selected.map(e=>e.light));
  return selected;
}

// A point light needs SIX depth views. Each light owns one 3x2 depth atlas,
// avoiding six sampler units and keeping within WebGL2's 16 texture units.
const MF_POINT_FACES = [
  [[1,0,0],[0,-1,0]], [[-1,0,0],[0,-1,0]],
  [[0,1,0],[0,0,1]], [[0,-1,0],[0,0,-1]],
  [[0,0,1],[0,-1,0]], [[0,0,-1],[0,-1,0]],
];
function mfPointCandidates(r) {
  const max = Math.min(MF_MAX_SHADOW_POINTS, Math.max(0, Math.floor(r.multiPointShadowMax ?? 1)));
  const items = r.multiPointShadowLights || [];
  if (!r.shadows || !max) {r.mfPreviousPointLights = new Set(); return [];}
  const previous = r.mfPreviousPointLights || new Set();
  const camera = r.camera?.pos || {x:0,y:0,z:0};
  const entries = items.filter(e=>e?.light && !e.light.destroyed && e.light.radius>0 && e.light.intensity>0 && e.light.color?.a>0)
    .map((entry,i)=> {
      const light=entry.light, pos=light.getWorldPos3D(),radius=light.radius;
      if (!mfShadowSphereInFrustum(r.viewProjection,pos,radius) && !entry.pinned) return null;
      const dist=Math.hypot(pos.x-camera.x,pos.y-camera.y,pos.z-camera.z);
      const col=light.color;
      const lum=.2126*col.r+.7152*col.g+.0722*col.b;
      const score=Math.sqrt(Math.max(.01,light.intensity*col.a*lum)) * radius/(Math.max(0,dist-radius)+radius)
        * Math.pow(1.05,Math.max(-40,Math.min(40,entry.priority||0)))
        * (previous.has(light)?MF_SHADOW_HYSTERESIS:1);
      return {entry,i,score};
    }).filter(Boolean).sort((a,b)=>Number(!!b.entry.pinned)-Number(!!a.entry.pinned) || b.score-a.score || a.i-b.i);
  const selected=entries.slice(0,max).map(e=>e.entry);
  r.mfPreviousPointLights=new Set(selected.map(e=>e.light));
  return selected;
}

const mfPointFragment = `
uniform int mfPointCount;
uniform int mfPointSlots[2];
uniform vec4 mfPointPositions[2];
uniform mat4 mfPointMatrices[12];
uniform vec4 mfPointParameters[2]; // depth bias and face texel size
uniform highp sampler2DShadow mfPoint0,mfPoint1;
float mfSamplePoint(int slot,vec3 q){return slot==0?texture(mfPoint0,q):texture(mfPoint1,q);}
float mfPointVisibility(int lightIndex,vec3 position) {
  if(shadowParams.x<=0.)return 1.;
  for(int j=0;j<2;++j){
    if(j>=mfPointCount)break;
    if(mfPointSlots[j]!=lightIndex)continue;
    vec3 delta=position-mfPointPositions[j].xyz;
    vec3 a=abs(delta);
    int face=a.x>=a.y&&a.x>=a.z?(delta.x>=0.?0:1):
      a.y>=a.z?(delta.y>=0.?2:3):(delta.z>=0.?4:5);
    vec4 projected=mfPointMatrices[j*6+face]*vec4(position,1.);
    if(projected.w<=0.)return 1.;
    vec3 q=projected.xyz/projected.w*.5+.5;
    if(any(greaterThanEqual(abs(q-.5),vec3(.5))))return 1.;
    q.z-=mfPointParameters[j].x/(projected.w*projected.w);
    float texel=mfPointParameters[j].y;
    vec2 uv=clamp(q.xy,vec2(texel),vec2(1.-texel));
    vec2 cell=vec2(float(face%3),float(face/3));
    float result=0.;
    for(int x=-1;x<=1;++x)for(int y=-1;y<=1;++y){
      vec2 st=(clamp(uv+vec2(x,y)*texel,vec2(texel),vec2(1.-texel))+cell)/vec2(3.,2.);
      result+=mfSamplePoint(j,vec3(st,q.z));
    }
    return result/9.;
  }
  return 1.;
}
`;

function mfEnsurePointAtlas(r,slot,size) {
  const gl=glContext, atlas=r.mfPointAtlases ||= [], entry=atlas[slot];
  const clamped=Math.max(64,Math.min(512,Math.floor(size)));
  if(entry && entry.size===clamped)return entry;
  if(entry){gl.deleteTexture(entry.texture);gl.deleteFramebuffer(entry.framebuffer);}
  const texture=gl.createTexture(), framebuffer=gl.createFramebuffer();
  gl.activeTexture(gl.TEXTURE0+14+slot);
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,clamped*3,clamped*2,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_MODE,gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_COMPARE_FUNC,gl.LEQUAL);
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,texture,0);
  gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)
    throw Error('Miniforge: point light depth atlas framebuffer incomplete');
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.activeTexture(gl.TEXTURE0);
  return atlas[slot]={texture,framebuffer,size:clamped};
}

function mfRenderPointAtlases(r) {
  const gl=glContext,selected=r.mfFramePoints||[];
  const slots=new Int32Array(MF_MAX_SHADOW_POINTS).fill(-1),
    positions=new Float32Array(MF_MAX_SHADOW_POINTS*4),
    matrices=new Float32Array(MF_MAX_SHADOW_POINTS*6*16),
    params=new Float32Array(MF_MAX_SHADOW_POINTS*4);
  let count=0;
  const oldShadowPass=r.shadowPass,oldPassMatrix=r.shadowPassMatrix,oldPlanes=r.shadowPlanes;
  const casters=render3DLayerObjects(!!r.renderAfter2D).filter(o=>
    render3DSetting(o,'castShadow')&&!render3DSetting(o,'additive')&&
    (!render3DSetting(o,'transparent')||o.tileInfo));
  try {
    for(const entry of selected) {
      const light=entry.light,li=r.mfFrameLights.indexOf(light);
      if(li<0)continue;
      const s=count,size=entry.mapSize||256;
      const atlas=mfEnsurePointAtlas(r,s,size),pos=light.getWorldPos3D();
      const far=light.radius,near=Math.min(Math.max(far/500,.02),far/2);
      gl.activeTexture(gl.TEXTURE0+14+s);gl.bindTexture(gl.TEXTURE_2D,null);
      gl.bindFramebuffer(gl.FRAMEBUFFER,atlas.framebuffer);
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
      gl.enable(gl.SCISSOR_TEST);
      slots[s]=li;
      positions.set([pos.x,pos.y,pos.z,far],s*4);
      params[s*4]=r.shadowBias*far*far*near/(far-near);
      params[s*4+1]=1/atlas.size;
      for(let face=0;face<6;face++) {
        const [dir,up]=MF_POINT_FACES[face];
        const view=Matrix4.lookAt(pos,pos.add(vec3(...dir)),vec3(...up));
        const m=Matrix4.perspective(Math.PI/2+.02,1,near,far).multiply(view.copy().invert());
        matrices.set(m.m,(s*6+face)*16);
        r.shadowPassMatrix=m;
        r.shadowPlanes=render3DFrustumPlanes(m);
        const x=face%3*atlas.size,y=Math.floor(face/3)*atlas.size;
        gl.viewport(x,y,atlas.size,atlas.size);
        gl.scissor(x,y,atlas.size,atlas.size);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        r.shadowPass=true;
        render3DUseShadowProgram(r.shadowShader);
        render3DDrawObjects(casters);
        r.onRenderOpaque?.();
        r.flush();render3DFlushInstances();
      }
      gl.disable(gl.SCISSOR_TEST);
      count++;
    }
  } finally {
    r.shadowPass=oldShadowPass;
    r.shadowPassMatrix=oldPassMatrix;
    r.shadowPlanes=oldPlanes;
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    gl.viewport(0,0,glCanvas.width,glCanvas.height);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D,r.shadowTexture);
    gl.activeTexture(gl.TEXTURE0);
  }
  r.mfPointData={count,slots,positions,matrices,params};
}

const mfFragmentExtension = `
uniform int mfShadowCount;
uniform int mfShadowSlots[4];
uniform mat4 mfShadowMatrices[4];
uniform vec4 mfShadowParameters[4]; // bias, UV blur, unused, unused
uniform vec4 mfGelAxes[4];
uniform int mfGelEnabled[4];
uniform highp sampler2DShadow mfShadow0,mfShadow1,mfShadow2,mfShadow3;
uniform sampler2D mfGel0,mfGel1,mfGel2,mfGel3;
float mfReadShadow(int slot,vec3 sampleCoord){
  if(slot==0)return texture(mfShadow0,sampleCoord);
  if(slot==1)return texture(mfShadow1,sampleCoord);
  if(slot==2)return texture(mfShadow2,sampleCoord);
  return texture(mfShadow3,sampleCoord);
}
vec3 mfReadGel(int slot,vec2 uv){
  if(slot==0)return texture(mfGel0,uv).rgb;
  if(slot==1)return texture(mfGel1,uv).rgb;
  if(slot==2)return texture(mfGel2,uv).rgb;
  return texture(mfGel3,uv).rgb;
}
vec3 mfLightVisibility(int lightIndex, vec3 position){
  if(shadowParams.x<=0.)return vec3(1.);
  for(int j=0;j<4;++j){
    if(j>=mfShadowCount)break;
    if(mfShadowSlots[j]!=lightIndex)continue;
    vec4 projected=mfShadowMatrices[j]*vec4(position,1.);
    if(projected.w<=0.)return vec3(1.);
    vec3 q=projected.xyz/projected.w*.5+.5;
    if(any(greaterThanEqual(abs(q-.5),vec3(.5))))return vec3(1.);
    q.z-=mfShadowParameters[j].x/(projected.w*projected.w);
    float shadow=0.;
    for(int x=-1;x<=1;++x)for(int y=-1;y<=1;++y)
      shadow+=mfReadShadow(j,vec3(q.xy+vec2(x,y)*mfShadowParameters[j].y,q.z));
    vec3 visibility=vec3(shadow/9.);
    if(mfGelEnabled[j]!=0){
      vec2 g=projected.xy/projected.w;
      vec4 axes=mfGelAxes[j];
      vec2 uv=vec2(dot(axes.xy,g),dot(axes.zw,g))*.5+.5;
      visibility*=mfReadGel(j,vec2(uv.x,1.-uv.y));
    }
    return visibility;
  }
  return vec3(1.);
}
`;

// Box-projected local reflection probes. The same calculation is used by
// baked and realtime captures: only the cubemap update frequency differs.
const mfReflectionFragment = `
uniform vec4 mfReflectionBoxMin, mfReflectionBoxMax, mfReflectionCapture;
vec3 mfParallaxDirection(vec3 position,vec3 direction) {
  if(mfReflectionBoxMin.w<.5)return direction;
  vec3 d=normalize(direction);
  vec3 safe=vec3(abs(d.x)<1e-5?(d.x<0.?-1e-5:1e-5):d.x,
                 abs(d.y)<1e-5?(d.y<0.?-1e-5:1e-5):d.y,
                 abs(d.z)<1e-5?(d.z<0.?-1e-5:1e-5):d.z);
  vec3 t0=(mfReflectionBoxMin.xyz-position)/safe;
  vec3 t1=(mfReflectionBoxMax.xyz-position)/safe;
  vec3 nearT=min(t0,t1),farT=max(t0,t1);
  float entry=max(max(nearT.x,nearT.y),nearT.z);
  float exitT=min(min(farT.x,farT.y),farT.z);
  if(exitT<=max(entry,0.))return direction;
  return normalize((position+d*exitT)-mfReflectionCapture.xyz);
}
`;

function mfPatchFragmentShader(source) {
  // These stable anchors are present in LittleJS 1.30's main and user snippet
  // shaders. Throw, rather than silently draw unshadowed lights after an upgrade.
  const sampler = 'uniform highp sampler2DShadow shadowMap;';
  const original = 'if(i==si)lc*=sh*gel();';
  if (!source.includes(sampler) || !source.includes(original))
    throw Error('Miniforge multi-shadow: unsupported LittleJS fragment shader; check pinned 1.30.1 renderer');
  return source.replace(sampler, sampler + mfFragmentExtension + mfPointFragment + mfReflectionFragment)
    .replace('textureLod(envMap,q,', 'textureLod(envMap,mfParallaxDirection(P,q),')
    // The stock shadow map always belongs to the sun; spotlight visibility and
    // optional gobo are now applied separately for *each* selected source.
    .replace(original, 'lc*=mfLightVisibility(i,P)*mfPointVisibility(i,P);');
}

// Run once per freshly compiled device scope, before first GL program is built.
function mfInstallMultiShadows() {
  const fragment = render3DFragmentSource;
  render3DFragmentSource = function(...args) { return mfPatchFragmentShader(fragment(...args)); };

  const collect = render3DCollectLights;
  render3DCollectLights = function() {
    const r = render3D;
    const lights = collect();
    const spots = mfSpotCandidates(r);
    const points = mfPointCandidates(r);
    // A shadow-casting spot must be among the eight lights fed to the shader.
    // Replace the least-priority ordinary light when the scene exceeds the cap.
    for (const {light} of [...spots,...points]) if (!lights.includes(light)) {
      if (lights.length >= RENDER3D_MAX_LIGHTS) {
        // Keep previously selected casters; evict an ordinary light only.
        const victim = [...lights].reverse().find(l=>![...spots,...points].some(s=>s.light===l));
        if (!victim) break;
        lights.splice(lights.indexOf(victim),1);
      }
      lights.push(light);
    }
    r.mfFrameLights = lights;
    r.mfFrameSpots = spots.filter(e=>lights.includes(e.light));
    r.mfFramePoints = points.filter(e=>lights.includes(e.light));
    return lights;
  };

  // Light3D normally caps its cone only for the one 'shadowLight'. Apply the
  // same cap to every selected shadow spotlight to match its projection.
  const cone = render3DLightCone;
  render3DLightCone = function(light) {
    const r = render3D;
    if (!r.mfFrameSpots?.some(e=>e.light===light)) return cone(light);
    const old = r.shadowLight;
    r.shadowLight = light;
    try { return cone(light); } finally { r.shadowLight = old; }
  };

  const singleShadowMap = render3DRenderShadowMap;
  render3DRenderShadowMap = function() {
    const r = render3D, gl = glContext;
    // Save the original sun map even when several spotlights have cast-shadow.
    r.shadowLight = undefined;
    singleShadowMap();
    const sun = {
      texture:r.shadowTexture, framebuffer:r.shadowFramebuffer, size:r.shadowTextureSize,
      matrix:r.shadowMatrix, planes:r.shadowPlanes, bias:r.shadowDepthBias, axes:r.gelAxes,
      requestedSize:r.shadowMapSize,
    };
    const spots = r.mfFrameSpots || [];
    const maps = r.mfShadowMaps ||= [];
    const slots = new Int32Array(MF_MAX_SHADOW_SPOTS).fill(-1);
    const matrices = new Float32Array(MF_MAX_SHADOW_SPOTS*16);
    const params = new Float32Array(MF_MAX_SHADOW_SPOTS*4);
    const axes = new Float32Array(MF_MAX_SHADOW_SPOTS*4);
    const gels = new Int32Array(MF_MAX_SHADOW_SPOTS);
    let count=0;
    try {
      for (const entry of spots) {
        if (count >= MF_MAX_SHADOW_SPOTS) break;
        const index = r.mfFrameLights.indexOf(entry.light);
        if (index<0) continue;
        const slot = maps[count] ||= {texture:undefined, framebuffer:undefined, size:0};
        r.shadowTexture = slot.texture;
        r.shadowFramebuffer = slot.framebuffer;
        r.shadowTextureSize = slot.size;
        r.shadowMapSize = Math.min(2048,Math.max(256,entry.mapSize || sun.requestedSize));
        r.shadowLight = entry.light;
        singleShadowMap();
        slot.texture = r.shadowTexture;
        slot.framebuffer = r.shadowFramebuffer;
        slot.size = r.shadowTextureSize;
        slot.gelTexture = render3DTextureOf(entry.light.gel)?.glTexture;
        slots[count] = index;
        matrices.set(r.shadowMatrix.m,count*16);
        params[count*4] = r.shadowDepthBias;
        params[count*4+1] = r.shadowSoftness/r.shadowTextureSize;
        if (r.gelAxes) axes.set(r.gelAxes,count*4);
        gels[count] = slot.gelTexture ? 1 : 0;
        count++;
      }
    } finally {
      r.shadowTexture = sun.texture;
      r.shadowFramebuffer = sun.framebuffer;
      r.shadowTextureSize = sun.size;
      r.shadowMatrix = sun.matrix;
      r.shadowPlanes = sun.planes;
      r.shadowDepthBias = sun.bias;
      r.gelAxes = sun.axes;
      r.shadowMapSize = sun.requestedSize;
      r.shadowLight = undefined;
      // The internal shadow pass binds unit 1 to each map in turn.
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D,sun.texture);
      gl.activeTexture(gl.TEXTURE0);
    }
    r.mfShadowData={count,slots,matrices,params,axes,gels};
    mfRenderPointAtlases(r);
  };

  const useProgram = render3DUseProgram;
  render3DUseProgram = function(program) {
    useProgram(program);
    const r=render3D,gl=glContext;
    const data=r.shadows && r.passIsDefault && r.mfShadowData || {count:0};
    const u=name=>gl.getUniformLocation(program,name);
    gl.uniform1i(u('mfShadowCount'),data.count);
    if (data.count) {
      gl.uniform1iv(u('mfShadowSlots[0]'),data.slots);
      gl.uniformMatrix4fv(u('mfShadowMatrices[0]'),false,data.matrices);
      gl.uniform4fv(u('mfShadowParameters[0]'),data.params);
      gl.uniform4fv(u('mfGelAxes[0]'),data.axes);
      gl.uniform1iv(u('mfGelEnabled[0]'),data.gels);
    }
    for (let j=0;j<MF_MAX_SHADOW_SPOTS;j++) {
      gl.activeTexture(gl.TEXTURE0+6+j);
      gl.bindTexture(gl.TEXTURE_2D,j<data.count?r.mfShadowMaps[j]?.texture:r.shadowTexture);
      gl.activeTexture(gl.TEXTURE0+10+j);
      gl.bindTexture(gl.TEXTURE_2D,(j<data.count && r.mfShadowMaps[j]?.gelTexture) || r.whiteTexture);
      gl.uniform1i(u('mfShadow'+j),6+j);
      gl.uniform1i(u('mfGel'+j),10+j);
    }
    const pd=r.shadows && r.passIsDefault ? r.mfPointData : undefined;
    gl.uniform1i(u('mfPointCount'),pd?.count||0);
    if(pd?.count){
      gl.uniform1iv(u('mfPointSlots[0]'),pd.slots);
      gl.uniform4fv(u('mfPointPositions[0]'),pd.positions);
      gl.uniformMatrix4fv(u('mfPointMatrices[0]'),false,pd.matrices);
      gl.uniform4fv(u('mfPointParameters[0]'),pd.params);
    }
    for(let j=0;j<MF_MAX_SHADOW_POINTS;j++){
      gl.activeTexture(gl.TEXTURE0+14+j);
      gl.bindTexture(gl.TEXTURE_2D,j<(pd?.count||0)?r.mfPointAtlases?.[j]?.texture:r.shadowTexture);
      gl.uniform1i(u('mfPoint'+j),14+j);
    }
    gl.activeTexture(gl.TEXTURE0);
  };

  // Set local probe data PER DRAW, not per shader program. Models within
  // different zones may share the same shader and draw consecutively.
  const setMaterial = render3DSetMaterialUniforms;
  render3DSetMaterialUniforms = function(state) {
    setMaterial(state);
    const gl = glContext, r = render3D;
    const env = state.environment || state.environmentMap || r.environment;
    const box = env?.mfReflectionBox;
    const program = r.currentProgram;
    const loc = name => gl.getUniformLocation(program, name);
    if (box && env?.capturePos) {
      gl.uniform4f(loc('mfReflectionBoxMin'),...box.min,1);
      gl.uniform4f(loc('mfReflectionBoxMax'),...box.max,1);
      gl.uniform4f(loc('mfReflectionCapture'),env.capturePos.x,env.capturePos.y,env.capturePos.z,1);
    } else {
      gl.uniform4f(loc('mfReflectionBoxMin'),0,0,0,0);
    }
  };

  const free = render3DFreeGL;
  render3DFreeGL = function(r) {
    for(const map of r.mfShadowMaps||[]) {
      map.texture && glContext.deleteTexture(map.texture);
      map.framebuffer && glContext.deleteFramebuffer(map.framebuffer);
    }
    r.mfShadowMaps=[];
    for(const atlas of r.mfPointAtlases||[]){
      atlas.texture && glContext.deleteTexture(atlas.texture);
      atlas.framebuffer && glContext.deleteFramebuffer(atlas.framebuffer);
    }
    r.mfPointAtlases=[];
    free(r);
  };
}
mfInstallMultiShadows();
