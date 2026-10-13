// ============================================================
//  长江：城区西侧外围的一条大河 + 河上的水电站
//
//  走向：北端（-z）从城郊山间流出，沿城区西侧外围向南（+z）汇入平原，
//        大致贴合俯视图里从城市西北角斜向西南的那条红线。
//
//  本模块只提供「河中心线 / 河宽 / 水位 / 河床」这四组纯函数，
//  三处必须共用同一份，否则会打架：
//    · terrain.js   —— 沿河把地面下切成河床（否则河会浮在草皮上）
//    · trees.js     —— 岸边不长树（否则树从水里长出来）
//    · 本模块的水面网格
//
//  水位：坝上游比坝下游高 4.8（HYDRO 处），落差由坝体维持，
//        所以水面被拆成上游水库段与下游急流段两张网格。
// ============================================================
import * as THREE from 'three'

export const RIVER = {
  name: '长江',
  zFrom: -500, // 北端：直接顶到地形边缘，河自山间流出（端头不在地形内，避免出现横切面）
  zTo: 500, // 南端：地形边缘（画面外）
  xRef: -340, // 河中心线基准（城区西边界外约 90）
  bankFade: 26, // 河岸过渡带宽度：地形从河床回升到自然地面
  upperLevel: -0.8, // 坝上游水位（水库）
  upperBed: -4.6, // 坝上游河床
  lowerLevel: -5.6, // 坝下游水位
  lowerBed: -10.4 // 坝下游河床
}

/** 水电站（坝轴线） */
export const HYDRO = {
  z: 62, // 坝轴线（河的中段）
  crest: 5, // 坝顶标高
  depth: 10, // 坝体厚度（z 方向）
  spillWest: 26, // 溢流段西界 = 河中心 - 26
  spillEast: 10, // 溢流段东界 = 河中心 + 10
  houseEast: 38, // 厂房坝段东界 = 河中心 + 38
  westSpan: 52, // 坝西端 = 河中心 - 52
  eastSpan: 60, // 坝东端 = 河中心 + 60
  spillBays: 4 // 溢流孔数
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep01 = (t) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/** 河中心线：整体沿 z，向西侧缓缓弯曲（弯曲幅度压在城区之外） */
export function riverCenterX(z) {
  return RIVER.xRef + 14 * Math.sin((z - 60) / 235) + 5 * Math.sin((z + 120) / 88)
}

/** 水面半宽：山间窄、平原宽 */
export function riverHalfWidth(z) {
  return 20 + 9 * smoothstep01((z - RIVER.zFrom) / 520)
}

/** 水面标高：坝上 / 坝下 */
export function riverWaterY(z) {
  return z <= HYDRO.z ? RIVER.upperLevel : RIVER.lowerLevel
}

/** 河床标高：在坝轴附近过渡，落差被坝体挡住 */
export function riverBedY(z) {
  const t = smoothstep01((z - (HYDRO.z - 9)) / 18)
  return RIVER.upperBed + (RIVER.lowerBed - RIVER.upperBed) * t
}

/** 河道横断面：0 河心、±1 水边、超出去就是在河外 */
export function riverCrossRatio(x, z) {
  return (x - riverCenterX(z)) / riverHalfWidth(z)
}

export function riverSample(z) {
  return {
    centerX: riverCenterX(z),
    halfWidth: riverHalfWidth(z),
    water: riverWaterY(z),
    bed: riverBedY(z)
  }
}

/** 点是否落在河道（含 margin）内 */
export function riverContains(x, z, margin = 0) {
  if (z < RIVER.zFrom - 2 || z > RIVER.zTo + 2) return false
  return Math.abs(x - riverCenterX(z)) <= riverHalfWidth(z) + margin
}

/**
 * 河道下切：把河槽内的地面压到河床，再向两岸平滑回升到原地形。
 * 山区因此得到一条 V 形河谷，平原上则是一条下沉的河槽。
 */
export function riverCarve(x, z, h) {
  if (z < RIVER.zFrom || z > RIVER.zTo) return h
  const half = riverHalfWidth(z)
  const d = Math.abs(x - riverCenterX(z))
  if (d >= half + RIVER.bankFade) return h
  const bed = riverBedY(z)
  if (h <= bed) return h
  const t = smoothstep01((d - half) / RIVER.bankFade)
  return bed + (h - bed) * t
}

/**
 * 水面网格：沿 z 采样出条带，横向 7 点。
 * 顶点直接写世界坐标（网格不做位移），法线朝上，
 * 另带一条 aCross（-1..1 的横向坐标）供 shader 判断离岸远近。
 */
export function buildRiverSurface({ fromZ, toZ, step = 4, across = 7 }) {
  const rows = Math.max(1, Math.ceil((toZ - fromZ) / step))
  const positions = []
  const normals = []
  const crosses = []
  const indices = []

  for (let i = 0; i <= rows; i++) {
    const z = fromZ + ((toZ - fromZ) * i) / rows
    const { centerX, halfWidth, water } = riverSample(z)
    for (let j = 0; j < across; j++) {
      const t = (j / (across - 1)) * 2 - 1
      positions.push(centerX + t * halfWidth, water, z)
      normals.push(0, 1, 0)
      crosses.push(t)
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j
      const b = a + 1
      const c = a + across
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('aCross', new THREE.Float32BufferAttribute(crosses, 1))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

// ------------------------------------------------------------
//  水面材质
//  用 MeshStandardMaterial + onBeforeCompile 注入，而不是从零写
//  ShaderMaterial —— 这样昼夜灯光、天空盒环境反射、雾效都自动继承，
//  水管昼夜和天气时不用额外同步一遍。
// ------------------------------------------------------------

const RIVER_VERT_HEAD = /* glsl */ `
uniform float uTime;
uniform vec2 uFlowDirection;
uniform float uFlowSpeed;
uniform float uWaveAmp;
attribute float aCross;
varying vec3 vRiverWorld;
varying float vCross;
`

const RIVER_VERT_BODY = /* glsl */ `
  vec2 riverFlow = normalize(uFlowDirection);
  vec3 riverWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float riverSwell =
      sin(dot(riverWorld.xz, riverFlow) * 0.055 + uTime * uFlowSpeed * 1.05)
    + 0.55 * sin(dot(riverWorld.xz, riverFlow) * 0.13 - uTime * uFlowSpeed * 1.6)
    + 0.30 * sin(dot(riverWorld.xz, vec2(-riverFlow.y, riverFlow.x)) * 0.19 + uTime * uFlowSpeed * 0.75);
  transformed.y += riverSwell * uWaveAmp;
  vRiverWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vCross = aCross;
`

const RIVER_FRAG_HEAD = /* glsl */ `
uniform float uTime;
uniform vec2 uFlowDirection;
uniform float uFlowSpeed;
uniform float uWaveScale;
uniform float uNormalStrength;
uniform vec4 uFoam;      // x: 岸边浪花强度, y: 消力池中心 z, z: 影响半径, w: 湍流强度
uniform vec3 uFoamColor;
varying vec3 vRiverWorld;
varying float vCross;

float riverHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float riverNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = riverHash(i);
  float b = riverHash(i + vec2(1.0, 0.0));
  float c = riverHash(i + vec2(0.0, 1.0));
  float d = riverHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float riverFbm(vec2 p) {
  return 0.6 * riverNoise(p) + 0.3 * riverNoise(p * 2.17) + 0.13 * riverNoise(p * 4.31);
}

// 四层行进波 + 一层噪声细节，凑出「水在往前流」的法线。
// 末尾再乘一层低频噪声做相位打散：纯正弦叠加会出现规则的横条纹，
// 一眼就看出是数学公式而不是水。
vec3 riverWaterNormal(vec2 p, float t) {
  vec2 d0 = normalize(uFlowDirection);
  vec2 d1 = vec2(-d0.y, d0.x);
  vec2 d2 = normalize(d0 * 0.75 + d1 * 0.66);
  vec2 d3 = normalize(d0 * 0.62 - d1 * 0.78);

  float nx = 0.0;
  float nz = 0.0;
  float phase = 0.0;

  phase = dot(p, d0) * 0.32 + t * 1.45;
  nx += cos(phase) * d0.x; nz += cos(phase) * d0.y;
  phase = dot(p, d1) * 0.85 - t * 0.62 + 1.7;
  nx += 0.5 * cos(phase) * d1.x; nz += 0.5 * cos(phase) * d1.y;
  phase = dot(p, d2) * 1.75 + t * 2.35 + 3.1;
  nx += 0.3 * cos(phase) * d2.x; nz += 0.3 * cos(phase) * d2.y;
  phase = dot(p, d3) * 3.6 - t * 3.1 + 5.0;
  nx += 0.16 * cos(phase) * d3.x; nz += 0.16 * cos(phase) * d3.y;

  float e = 0.4;
  vec2 q = p * 0.85 + d0 * t * 1.7;
  float n0 = riverFbm(q);
  nx += (riverFbm(q + vec2(e, 0.0)) - n0) * 2.4;
  nz += (riverFbm(q + vec2(0.0, e)) - n0) * 2.4;

  float scramble = 1.0 + 0.75 * (riverFbm(p * 0.09 + d0 * t * 0.3) - 0.5);
  nx *= scramble;
  nz *= scramble;

  return normalize(vec3(-nx * uWaveScale, 1.0, -nz * uWaveScale));
}

// 白沫：岸边浪花 + 坝下消力池湍流
float riverFoamMask(vec3 w, float crossT, float t) {
  vec2 d0 = normalize(uFlowDirection);
  vec2 d1 = vec2(-d0.y, d0.x);

  float edgeDist = min(crossT * 0.5 + 0.5, 0.5 - crossT * 0.5); // 0 岸边 → 0.5 河心
  float streak = riverFbm(w.xz * 0.36 + d0 * t * 2.6);
  float chop = riverFbm(w.xz * 0.95 + d1 * t * 1.5);
  float shore = uFoam.x * (1.0 - smoothstep(0.012, 0.1, edgeDist)) * (0.42 + 0.72 * streak);

  float d = (w.z - uFoam.y) / max(uFoam.z, 0.001);
  float plunge = step(0.0, w.z - uFoam.y) * uFoam.w * exp(-d * d * 1.5);
  plunge *= 0.4 + 0.95 * chop;

  return shore + plunge;
}
`

// 注意：meshphysical 里 roughnessmap_fragment(180) 排在 normal_fragment_begin(182) 之前，
// 所以两处改动都挂在 normal_fragment_begin 之后 —— 那里 roughnessFactor 已经定义好了。
const RIVER_FRAG_BODY = /* glsl */ `
  vec3 riverN = riverWaterNormal(vRiverWorld.xz, uTime * uFlowSpeed);
  normal = normalize(mix(normal, normalize(mat3(viewMatrix) * riverN), uNormalStrength));
  // 水色深浅：一层低速漂移的噪声，做出水下起伏与流势
  float riverTone = riverFbm(vRiverWorld.xz * 0.055 + normalize(uFlowDirection) * uTime * uFlowSpeed * 0.32);
  diffuseColor.rgb *= 0.82 + 0.36 * riverTone;
  float riverFoam = clamp(riverFoamMask(vRiverWorld, vCross, uTime * uFlowSpeed), 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, riverFoam);
  roughnessFactor = mix(roughnessFactor, 0.36, riverFoam);
`

/**
 * 水面材质。所有水面共用同一份 shader 源码（参数只走 uniform），
 * 因此 program 只编译一次。
 */
export function createRiverMaterial({
  color = '#1d4a63',
  opacity = 0.92,
  roughness = 0.06,
  metalness = 0.02,
  envMapIntensity = 1.25,
  flowSpeed = 1,
  flowDirection = [0, 1],
  waveAmp = 0.16,
  waveScale = 0.85,
  normalStrength = 1,
  shoreFoam = 0.5,
  plungeZ = 0,
  plungeReach = 26,
  plungeStrength = 0
} = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uFlowDirection: { value: new THREE.Vector2(flowDirection[0], flowDirection[1]) },
    uFlowSpeed: { value: flowSpeed },
    uWaveAmp: { value: waveAmp },
    uWaveScale: { value: waveScale },
    uNormalStrength: { value: normalStrength },
    uFoam: { value: new THREE.Vector4(shoreFoam, plungeZ, plungeReach, plungeStrength) },
    uFoamColor: { value: new THREE.Color('#eaf4f9') }
  }

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide
  })

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${RIVER_VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>${RIVER_VERT_BODY}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${RIVER_FRAG_HEAD}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>${RIVER_FRAG_BODY}`)
  }
  material.customProgramCacheKey = () => 'river-water'
  material.userData.uniforms = uniforms

  return material
}

/** 每帧推进水面时间（三张水面共享同一份 uniform） */
export function tickRiverMaterial(material, elapsed) {
  const uniforms = material?.userData?.uniforms
  if (uniforms) uniforms.uTime.value = elapsed
}
