import * as THREE from 'three'
import { SUN_DIRECTION } from './environments'

// ============================================================
//  天空盒：用 6 张程序化生成的 canvas 组成立方体贴图
//  —— 取代原来「单色背景 + 靠雾遮丑」的做法，让天空有真实的
//     纵向渐变、太阳/月亮、云层、星点，且能随昼夜/天气平滑变化
// ============================================================

// 每面边长。256 有两个原因：
// 1) 与原来 <Environment resolution={256}> 的环境贴图分辨率一致，反射质量不降；
// 2) 过渡时需要反复重绘（见 components/Sky），面越大重绘越慢。
export const SKY_FACE_SIZE = 256

// 云层噪声的固定种子。必须是常量：重绘时云形不能变，否则过渡会「抖」。
const CLOUD_SEED_X = 13.7
const CLOUD_SEED_Y = -5.3

const DIR = new THREE.Vector3(...SUN_DIRECTION).normalize()
const SUN_X = DIR.x
const SUN_Y = DIR.y
const SUN_Z = DIR.z

// ============================================================
//  方向约定（实测得出，别再靠推导）
// ============================================================
// three 的 CubeTexture 面顺序名义上是 [+X, -X, +Y, -Y, +Z, -Z]，
// 但「哪张 canvas 被采样给了哪个方向」跟直觉不一致。用 probe 页
// 把每个像素编码成 (面号,u,v) 再沿指定方向渲染读中心像素，实测结果是：
//
//   canvas 0 实际对应世界的 -X 方向，canvas 1 对应 +X（两者角色是反的）
//   canvas 2/3/4/5 依次对应 +Y / -Y / +Z / -Z（这几张是对的）
//   竖直方向是反的：canvas 的**最后一行（底部）**才是世界上方
//
// 综合起来，下面这张表就是「给定 canvas 上的 (a=2u-1, b=1-2v)，
// 该写哪个世界方向的颜色」。它已经包含了上面所有实测偏差，
// 所以调用 skyPixel 时直接传这个方向，不要再做任何额外取反：
//
//   canvas 0: (-1, -b, -a)      canvas 3: (-a, -1, -b)
//   canvas 1: ( 1, -b,  a)      canvas 4: (-a, -b,  1)
//   canvas 2: (-a,  1,  b)      canvas 5: ( a, -b, -1)
//
// 校验方式：probe2.html 用真实调色板贴图后沿各方向采样，
// 与 skyPixel(方向) 直接比对，必须逐像素相等。
// ============================================================

// ---- 数值小工具 ----
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** 二维值噪声（双线性 + 平滑插值），跨立方体面天然连续 */
function vnoise(x, y) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  const top = a + (b - a) * u
  const bot = c + (d - c) * u
  return top + (bot - top) * v
}

function fbm(x, y, octaves) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let fx = x
  let fy = y
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(fx, fy) * amp
    norm += amp
    amp *= 0.5
    fx = fx * 2.03 + 11.3
    fy = fy * 2.03 - 7.7
  }
  return sum / norm
}

// ---- 调色板 ----
// 颜色字段是 [r,g,b]（0~1，sRGB 直通，不做线性化：贴图按 SRGBColorSpace 上传，
// 管线会自己解码/编码，写什么颜色最终就显示什么颜色，且背景不走 tone mapping）。
export const SKY_KEYS = [
  'zenith',
  'horizon',
  'below',
  'haze',
  'sunColor',
  'glowColor',
  'glow',
  'disc',
  'discAngle',
  'cloudColor',
  'cloudShade',
  'cloudCover',
  'cloudAmount',
  'cloudScale',
  'stars'
]

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** 把「hex + 数字」形式的配置转成纯数值调色板（方便逐帧插值） */
export function makeSkyPalette(spec, out = {}) {
  for (const k of SKY_KEYS) {
    const v = spec[k]
    out[k] = typeof v === 'string' ? hexToRgb(v) : v
  }
  return out
}

/** 逐字段插值两个调色板（颜色数组逐通道插，标量直接插） */
export function lerpSkyPalette(a, b, t, out = {}) {
  for (const k of SKY_KEYS) {
    const va = a[k]
    const vb = b[k]
    if (Array.isArray(va)) {
      out[k] = [
        va[0] + (vb[0] - va[0]) * t,
        va[1] + (vb[1] - va[1]) * t,
        va[2] + (vb[2] - va[2]) * t
      ]
    } else {
      out[k] = va + (vb - va) * t
    }
  }
  return out
}

// 单像素求值用的复用数组（每帧几十万次调用，不能在里面 new）
const _out = [0, 0, 0]

// 纵向渐变查找表大小。这个渐变只是 dy 的函数，逐像素算 pow 太贵；
// 每个调色板只建一次表，像素里只做查表 + 线性插值。
// 取 1025 而不是 512：dy→0 处 pow(dy, 0.72) 的斜率趋于无穷，
// 采样点太稀地平线附近会出现折角。
const GRAD_N = 1025

/**
 * 预计算「与像素无关、只与调色板有关」的量：纵向渐变表 + 日面软边阈值。
 * 重绘时每个调色板调用一次。
 */
export function makeSkyPre(p, pre = {}) {
  const grad = new Float32Array(GRAD_N * 3)
  for (let i = 0; i < GRAD_N; i++) {
    const dy = (i / (GRAD_N - 1)) * 2 - 1
    let k
    let a
    let b
    if (dy >= 0) {
      // 0.52 次幂：近地平线变化更快。默认相机受 maxPolarAngle 限制永远看不到天顶，
      // 能看到的只有 0~20° 这一条带，指数太缓的话这条带会一直是灰白的天际色。
      k = smoothstep(0, 1, Math.pow(dy, 0.52))
      a = p.horizon
      b = p.zenith
    } else {
      // 地平线下方先留一条「雾带」保持地平线色，再过渡到地面色。
      // 远处地形/地面平面的边界就落在这条雾带里，于是边界看不出来。
      const t = clamp01(-dy / p.haze)
      k = t * t
      a = p.horizon
      b = p.below
    }
    grad[i * 3] = a[0] + (b[0] - a[0]) * k
    grad[i * 3 + 1] = a[1] + (b[1] - a[1]) * k
    grad[i * 3 + 2] = a[2] + (b[2] - a[2]) * k
  }
  pre.grad = grad
  const cosEdge = Math.cos(p.discAngle)
  pre.cosEdge = cosEdge
  pre.cosInner = cosEdge - 0.0006
  return pre
}

/**
 * 给定「世界方向」，算出天空颜色，写入 out。
 * 顺序：纵向渐变 → 日月（光晕+本体）→ 云 → 星点
 * 云放在日月之后画，这样云会自然遮住太阳本体。
 * pre 由 makeSkyPre 生成（同一调色板复用）。
 */
export function skyPixel(dx, dy, dz, p, pre, out = _out) {
  // ---- 1. 纵向渐变（查表）----
  const gt = (dy + 1) * ((GRAD_N - 1) / 2)
  const gi = gt > 0 ? gt | 0 : 0
  const gf = gt - gi
  const g0 = gi * 3
  const g1 = (gi + 1 < GRAD_N ? gi + 1 : gi) * 3
  const grad = pre.grad
  let r = grad[g0] + (grad[g1] - grad[g0]) * gf
  let g = grad[g0 + 1] + (grad[g1 + 1] - grad[g0 + 1]) * gf
  let b = grad[g0 + 2] + (grad[g1 + 2] - grad[g0 + 2]) * gf

  const s = dx * SUN_X + dy * SUN_Y + dz * SUN_Z

  // ---- 2. 太阳 / 月亮：光晕（加法）+ 本体（软边圆盘）----
  if (p.glow > 0.002 && s > 0) {
    // 拆成两层：紧贴着日面的一层强光晕 + 很大范围的一层弱暖光。
    // 只用 s^6 的话半强半径约 27°，整片天空都被洗成灰白——那正是要修掉的「雾蒙蒙」。
    const s2 = s * s
    const s4 = s2 * s2
    const s6 = s4 * s2
    const s8 = s4 * s4
    const s16 = s8 * s8
    const s32 = s16 * s16
    const s48 = s32 * s16
    const halo = p.glow * (0.8 * s48 + 0.2 * s6)
    r += p.glowColor[0] * halo
    g += p.glowColor[1] * halo
    b += p.glowColor[2] * halo
  }
  if (p.disc > 0.002) {
    const d0 = smoothstep(pre.cosInner, pre.cosEdge, s) * p.disc
    if (d0 > 0) {
      r += (p.sunColor[0] - r) * d0
      g += (p.sunColor[1] - g) * d0
      b += (p.sunColor[2] - b) * d0
    }
  }

  // ---- 3. 云层 ----
  if (p.cloudAmount > 0.002 && dy > 0.015) {
    // 把方向投影到「云层所在平面」上：py 越大越靠近天顶，越小越贴地平线。
    // 分母加 0.20 是防止接近地平线时坐标发散（真实云层也是这样向地平线收敛的）。
    const py = dy + 0.2
    const px = (dx / py) * p.cloudScale + CLOUD_SEED_X
    const pz = (dz / py) * p.cloudScale + CLOUD_SEED_Y
    const n = fbm(px, pz, 3)
    const thr = 1 - p.cloudCover
    const dens = smoothstep(thr, thr + 0.32, n)
    // 接近地平线时淡出，避免投影拉伸导致的噪点
    const a = dens * smoothstep(0.015, 0.2, dy) * p.cloudAmount
    if (a > 0.002) {
      // 低频噪声决定云顶（亮）/ 云底（暗）。频率比云形本身更低，
      // 这样明暗是大片连续的，不会在每朵云上各来一遍。
      const sh = vnoise(px * 0.35, pz * 0.35)
      const cs = p.cloudShade
      const cc = p.cloudColor
      r += (cs[0] + (cc[0] - cs[0]) * sh - r) * a
      g += (cs[1] + (cc[1] - cs[1]) * sh - g) * a
      b += (cs[2] + (cc[2] - cs[2]) * sh - b) * a
    }
  }

  // ---- 4. 星点（只有夜间有）----
  if (p.stars > 0.0001 && dy > 0.02) {
    // 用「方向量化后的格子」做哈希：同一颗星在 6 个面上算出来是同一个值，
    // 不会出现接缝处半颗星。
    const h = hash3(Math.round(dx * 150), Math.round(dy * 150), Math.round(dz * 150))
    const edge = 1 - p.stars
    if (h > edge) {
      const k = (h - edge) / p.stars
      const a = k * k * smoothstep(0.02, 0.3, dy)
      r += (1 - r) * a
      g += (1 - g) * a
      b += (1 - b) * a
    }
  }

  out[0] = r
  out[1] = g
  out[2] = b
  return out
}

const _faceDir = [0, 0, 0]

/**
 * 给定 canvas 上的 (face, a, b)，求出它对应的世界方向（已归一化）。
 *   a = 2u-1（canvas 左 → 右），b = 1-2v（canvas 下 → 上，v 是行号，顶行 0）
 *
 * 这张表是「实测」出来的（不是推导的），见文件开头「方向约定」。
 * 之所以抽成函数并导出：绘图和校验脚本必须用同一份实现，
 * 否则各写一套约定、一起错，自己跟自己对得上却和渲染器对不上。
 */
export function faceDirection(face, a, b, out = [0, 0, 0]) {
  let dx
  let dy
  let dz
  switch (face) {
    case 0: dx = -1; dy = -b; dz = -a; break
    case 1: dx = 1; dy = -b; dz = a; break
    case 2: dx = -a; dy = 1; dz = b; break
    case 3: dx = -a; dy = -1; dz = -b; break
    case 4: dx = -a; dy = -b; dz = 1; break
    default: dx = a; dy = -b; dz = -1; break
  }
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  out[0] = dx / len
  out[1] = dy / len
  out[2] = dz / len
  return out
}

/**
 * 把一个面渲染进 data（RGBA，行优先，第 0 行是图片顶部）。
 * 独立于 DOM，方便在 Node 里直接跑数据校验。
 */
export function paintFaceData(size, face, p, data, pre = makeSkyPre(p)) {
  const inv = 2 / size
  const out = [0, 0, 0]
  let k = 0
  for (let v = 0; v < size; v++) {
    const b = 1 - (v + 0.5) * inv
    for (let u = 0; u < size; u++) {
      const a = (u + 0.5) * inv - 1
      const dir = faceDirection(face, a, b, _faceDir)
      skyPixel(dir[0], dir[1], dir[2], p, pre, out)
      data[k++] = out[0] * 255
      data[k++] = out[1] * 255
      data[k++] = out[2] * 255
      data[k++] = 255
    }
  }
  return data
}

/** 建 6 张空白 canvas 并组成 CubeTexture。只建一次，之后反复重绘。 */
export function createSkybox(size = SKY_FACE_SIZE) {
  const faces = []
  for (let i = 0; i < 6; i++) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    faces.push(canvas)
  }
  const tex = new THREE.CubeTexture(faces)
  // 必须是 SRGB：canvas 里写的是 sRGB 字节值；顺带让背景走「不 tone mapping」的分支，
  // 画什么就显示什么。
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = true // 见文件开头的方向约定
  // 天空永远是全屏放大，不需要 mipmap（省掉 6 张图生成 mipmap 的开销）
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/** 用调色板重绘全部 6 个面（复用同一批 canvas，只改像素） */
export function paintSkybox(texture, palette) {
  // 查找表按调色板建一次，6 个面共用
  const pre = makeSkyPre(palette)
  for (let i = 0; i < 6; i++) {
    const canvas = texture.image[i]
    const size = canvas.width
    const ctx = canvas.getContext('2d')
    const img = ctx.createImageData(size, size)
    paintFaceData(size, i, palette, img.data, pre)
    ctx.putImageData(img, 0, 0)
  }
  texture.needsUpdate = true
}
