import * as THREE from 'three'
import {
  GROUND_SIZE,
  GRID_MIN,
  GRID_MAX,
  GRID_N,
  ROAD_LINES,
  ROAD_WIDTH,
  ASPHALT,
  verticalRoadX,
  horizontalRoadZ,
  mulberry32
} from './cityLayout'

const HALF = GROUND_SIZE / 2

// ---------- 配色 ----------
const BLOCK_FILL = '#454b54'
const CURB_FILL = '#6b727c'
const ASPHALT_FILL = '#20242b'
const LINE_WHITE = 'rgba(214,218,224,0.42)'
const LINE_YELLOW = '#c9b25b'
const CROSSWALK = 'rgba(226,230,236,0.6)'

/** 人行横道只在干道交叉口画（只有 ROAD_LINES 之间才成路口） */
const CROSS_LINES = ROAD_LINES

const halfRoad = ROAD_WIDTH / 2
const halfAsphalt = ASPHALT / 2

/**
 * 某条干道「中心线」的覆盖区间（沿另一轴的世界坐标）。
 *
 * 环城路（最外两条网格线 n = 0 / GRID_N）只到四角 ±96：否则四条边会各自伸到地面边缘，
 * 在四个角外多出四条 4 单位的秃头路。中心干道则保持贯通全城（±100）。
 */
const core = (n) => (n === 0 || n === GRID_N ? [GRID_MIN, GRID_MAX] : [-HALF, HALF])

/**
 * 实际铺设区间 = 中心线区间向两端各外扩半个路宽。
 *
 * 环城路必须外扩：四条边若不外扩，在角上会各差 1.8，环路外角就缺一个 1.8×1.8 的小方块。
 * 中心干道本来就顶到地面边缘，外扩部分会被画布自然裁掉，无副作用。
 */
const span = (n) => {
  const [lo, hi] = core(n)
  return [lo - halfRoad, hi + halfRoad]
}

/** 干道 n 是否「穿过」（而非终止于）坐标 v —— 环路转角处为 false，据此决定画不画斑马线 */
const crosses = (n, v) => {
  const [lo, hi] = core(n)
  return v > lo + 1e-6 && v < hi - 1e-6
}

/**
 * 程序化生成整座城市的地面纹理。
 *
 * 之所以是一张 2048 的大图、而不是一张小 tile 平铺：
 * 街区边长 16、地面 200，200/16 = 12.5 不是整数，平铺接缝必然错位；
 * 而且整幅图才能让「街区细节（井盖 / 人行横道分布 / 砖缝）」不至于处处雷同。
 *
 * @param {number} size 纹理分辨率（正方形）
 * @returns {THREE.CanvasTexture}
 */
export function createCityTexture(size = 2048) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const s = size / GROUND_SIZE // 世界单位 → 像素

  // 世界坐标 → 画布像素。
  // PlaneGeometry 转到水平面后 local +y → world -z，而贴图 flipY=true 又把
  // canvas 顶行送到 v=1，两次翻转恰好抵消，最后就是最朴素的一条。
  // 该结论由独立探针实测确认（2×2 四色平面 + 俯视正交相机读回四角颜色）。
  const X = (x) => (x + HALF) * s
  const Y = (z) => (z + HALF) * s
  const L = (v) => v * s // 长度换算

  // ---------- 0. 街区块铺装 ----------
  ctx.fillStyle = BLOCK_FILL
  ctx.fillRect(0, 0, size, size)

  // 铺装砖缝：用 pattern 平铺，比画几千条 stroke 快得多
  const brickPx = 16 // ≈1.56 世界单位
  const brickCanvas = document.createElement('canvas')
  brickCanvas.width = brickCanvas.height = brickPx
  const bctx = brickCanvas.getContext('2d')
  bctx.strokeStyle = 'rgba(0,0,0,0.17)'
  bctx.lineWidth = 1
  bctx.beginPath()
  bctx.moveTo(0.5, 0)
  bctx.lineTo(0.5, brickPx)
  bctx.moveTo(0, 0.5)
  bctx.lineTo(brickPx, 0.5)
  bctx.stroke()
  const brickPattern = ctx.createPattern(brickCanvas, 'repeat')
  if (brickPattern) {
    ctx.fillStyle = brickPattern
    ctx.fillRect(0, 0, size, size)
  }

  // ---------- 1. 路缘石 / 人行道（宽一档，平灰）----------
  // 先全部铺完再画沥青：否则后画的人行道会盖掉先画的路口沥青。
  ctx.fillStyle = CURB_FILL
  for (const n of ROAD_LINES) {
    const [vz0, vz1] = span(n)
    const x = verticalRoadX(n)
    ctx.fillRect(X(x - halfRoad), Y(vz0), L(ROAD_WIDTH), L(vz1 - vz0))
    const [vx0, vx1] = span(n)
    const z = horizontalRoadZ(n)
    ctx.fillRect(X(vx0), Y(z - halfRoad), L(vx1 - vx0), L(ROAD_WIDTH))
  }

  // ---------- 2. 沥青面（窄一档，带颗粒）----------
  const noisePx = 128
  const noiseCanvas = document.createElement('canvas')
  noiseCanvas.width = noiseCanvas.height = noisePx
  const nctx = noiseCanvas.getContext('2d')
  nctx.fillStyle = ASPHALT_FILL
  nctx.fillRect(0, 0, noisePx, noisePx)
  for (let i = 0; i < 2600; i++) {
    const g = Math.round(20 + Math.random() * 34)
    nctx.fillStyle = `rgba(${g},${g + 2},${g + 6},${0.22 + Math.random() * 0.36})`
    nctx.fillRect(Math.random() * noisePx, Math.random() * noisePx, 2, 2)
  }
  const asphaltPattern = ctx.createPattern(noiseCanvas, 'repeat')
  ctx.fillStyle = asphaltPattern || ASPHALT_FILL
  for (const n of ROAD_LINES) {
    const [vz0, vz1] = span(n)
    const x = verticalRoadX(n)
    ctx.fillRect(X(x - halfAsphalt), Y(vz0), L(ASPHALT), L(vz1 - vz0))
    const [vx0, vx1] = span(n)
    const z = horizontalRoadZ(n)
    ctx.fillRect(X(vx0), Y(z - halfAsphalt), L(vx1 - vx0), L(ASPHALT))
  }

  // ---------- 3. 车道边线（白实线）----------
  ctx.fillStyle = LINE_WHITE
  const edge = halfAsphalt - 0.18
  const lineW = Math.max(1, L(0.09))
  for (const n of ROAD_LINES) {
    const [vz0, vz1] = span(n)
    const y0 = Y(vz0)
    const hgt = L(vz1 - vz0)
    const x = verticalRoadX(n)
    ctx.fillRect(X(x - edge) - lineW / 2, y0, lineW, hgt)
    ctx.fillRect(X(x + edge) - lineW / 2, y0, lineW, hgt)
    const [vx0, vx1] = span(n)
    const x0 = X(vx0)
    const wid = L(vx1 - vx0)
    const z = horizontalRoadZ(n)
    ctx.fillRect(x0, Y(z - edge) - lineW / 2, wid, lineW)
    ctx.fillRect(x0, Y(z + edge) - lineW / 2, wid, lineW)
  }

  // ---------- 4. 车道中心虚线（黄）----------
  ctx.fillStyle = LINE_YELLOW
  const dashW = Math.max(1.2, L(0.13))
  const dashLen = L(0.62)
  for (const n of ROAD_LINES) {
    const [vz0, vz1] = span(n)
    const x = verticalRoadX(n)
    for (let z = vz0; z < vz1; z += 1.24) {
      ctx.fillRect(X(x) - dashW / 2, Y(z), dashW, dashLen)
    }
    const [vx0, vx1] = span(n)
    const zc = horizontalRoadZ(n)
    for (let x = vx0; x < vx1; x += 1.24) {
      ctx.fillRect(X(x), Y(zc) - dashW / 2, dashLen, dashW)
    }
  }

  // ---------- 5. 人行横道（中心区路口四边）----------
  const bandOffset = halfRoad + 0.9
  const bandDepth = 1.35
  const stripePitch = 0.95
  const stripeW = 0.5
  ctx.fillStyle = CROSSWALK
  for (const a of CROSS_LINES) {
    for (const b of CROSS_LINES) {
      const gx = verticalRoadX(a)
      const gz = horizontalRoadZ(b)

      // 竖路「穿过」这个路口才画南北向斑马线；环城路的四个转角处竖路止于此，
      // 硬画会把斑马线甩到路口外侧没路的地面上。
      if (crosses(a, gz)) {
        for (const sgn of [-1, 1]) {
          const zc = gz + sgn * bandOffset
          for (let x = -halfAsphalt + 0.2; x <= halfAsphalt - stripeW; x += stripePitch) {
            ctx.fillRect(X(gx + x), Y(zc - bandDepth / 2), L(stripeW), L(bandDepth))
          }
        }
      }
      if (crosses(b, gx)) {
        for (const sgn of [-1, 1]) {
          const xc = gx + sgn * bandOffset
          for (let z = -halfAsphalt + 0.2; z <= halfAsphalt - stripeW; z += stripePitch) {
            ctx.fillRect(X(xc - bandDepth / 2), Y(gz + z), L(bandDepth), L(stripeW))
          }
        }
      }
    }
  }

  // ---------- 6. 井盖等细节（只落在街区里，不压路）----------
  const rand = mulberry32(4242)
  ctx.fillStyle = 'rgba(10,10,10,0.42)'
  // 到最近一条干道的距离（两个轴各自算）—— 只避让真正铺出来的那几条
  const dToRoadX = (v) => Math.min(...ROAD_LINES.map((n) => Math.abs(v - verticalRoadX(n))))
  const dToRoadZ = (v) => Math.min(...ROAD_LINES.map((n) => Math.abs(v - horizontalRoadZ(n))))
  for (let i = 0; i < 110; i++) {
    const x = GRID_MIN + rand() * (GRID_MAX - GRID_MIN)
    const z = GRID_MIN + rand() * (GRID_MAX - GRID_MIN)
    if (dToRoadX(x) < halfRoad + 0.6) continue
    if (dToRoadZ(z) < halfRoad + 0.6) continue
    ctx.beginPath()
    ctx.arc(X(x), Y(z), L(0.17), 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}
