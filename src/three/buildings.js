// ============================================================
//  城市建筑：按功能区生成住宅 / 商场 / 工厂，并在中心区布置特色高层
//  - 几何体复用，靠 scale 变形；高层也按街区中心落位
//  - 每类用「6 面材质数组」区分墙身与屋顶（BoxGeometry 分组顺序 +x -x +y -y +z -z）
//  - 落位走 cityLayout 的街区中心，与道路网格严格对齐（横平竖直）
// ============================================================
import * as THREE from 'three'
import { GRID_N, EXTRA_Z_BLOCKS, EAST_SITES, blockCenterX, blockCenterZ, cityZone, inArea, mulberry32 } from './cityLayout'

export const TYPE = {
  RESIDENTIAL: 'residential',
  MALL: 'mall',
  FACTORY: 'factory'
}

/** 中心商业区半径（切比雪夫距离）。<= 该值为市区，> 为外围工业区 */
export const CBD_RADIUS = 52

const SKIP_RATE = 0.28 // 街区留空比例（绿地 / 停车场）

/**
 * 部分住宅街区改用真实楼宇模型（Quaternius Downtown City MegaKit，
 * 见 three/buildingModels.js），其余保留程序化板楼 —— 混排既吃到模型的
 * 细节质感，又保住板楼的夜景窗光氛围，也避免同一款模型大面积重复。
 * 套件预拼楼有 3 款（×4 朝向 = 12 种观感），优先铺设在住宅街区。
 */
const MODEL_BLOCK_RATE = 0.8
const MODEL_KEYS = ['quatLarge', 'quatMedium', 'quatSmall']
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12)
const UNIT_PEARL_COLUMN = new THREE.CylinderGeometry(0.5, 0.5, 1, 20)
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 32, 20)
const UNIT_UPPER_DOME = new THREE.SphereGeometry(0.502, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)
const UNIT_PEARL_BELT = new THREE.SphereGeometry(0.503, 32, 6, 0, Math.PI * 2, Math.PI / 2 - 0.22, 0.44)
const UNIT_SMALL_WINDOWS = new THREE.SphereGeometry(0.507, 48, 3, 0, Math.PI * 2, 1.10, 0.22)
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 12)
const UNIT_TAPER = new THREE.CylinderGeometry(0.25, 0.5, 1, 16)
const UNIT_WINDOW_BAND = new THREE.CylinderGeometry(0.5, 0.5, 1, 64, 1, true)

/** 上海中心风格：圆角三角截面向上旋转、收分，末端形成高低错落的塔冠。 */
function createShanghaiTower() {
  const point = (t, angle, offset) => {
    const radius = 0.5 * (1 - t * 0.5) * (1 + 0.11 * Math.cos(angle * 3)) + offset
    const twist = angle + t * Math.PI * 2 / 3
    return [Math.cos(twist) * radius, t - 0.055 * t ** 18 * (0.5 + 0.5 * Math.cos(angle)), Math.sin(twist) * radius]
  }
  const build = (strips) => {
    const positions = []
    const uvs = []
    const indices = []
    for (const [bottom, top, start, span, segments, offset] of strips) {
      for (let i = 0; i <= segments; i++) {
        const angle = start + span * i / segments
        for (const t of [bottom, top]) {
          positions.push(...point(t, angle, offset))
          uvs.push(angle / (Math.PI * 2), t)
        }
        if (i < segments) {
          const a = positions.length / 3 - 2
          indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }
  const fullTurn = Math.PI * 2
  const shell = build(Array.from({ length: 160 }, (_, i) => [i / 160, (i + 1) / 160, 0, fullTurn, 96, 0]))
  const bands = build(Array.from({ length: 120 }, (_, i) => {
    const t = (i + 1) / 120
    return [t - (i % 15 === 14 ? 0.0022 : 0.00045), t, 0, fullTurn, 96, 0.001]
  }))
  const ribs = build(Array.from({ length: 3 }, (_, rib) =>
    Array.from({ length: 160 }, (_, i) => [i / 160, (i + 1) / 160, rib * fullTurn / 3, 0.016, 1, 0.002])
  ).flat())
  return { shanghaiShell: shell, shanghaiBands: bands, shanghaiRibs: ribs }
}

const SHANGHAI_GEOMETRIES = createShanghaiTower()

// 中央公园东侧的 2×3 个连续大地块；每块跨 2×2 个原有小楼格心。
const SKYLINE_SITES = [
  { x: -14, z: -64, kind: 'pearl' },
  { x: 14, z: -64, kind: 'shanghai' },
  { x: -14, z: 0, kind: 'twins' },
  { x: 14, z: 0, kind: 'spire' },
  { x: 64, z: 0, kind: 'dji' },
  { x: -14, z: 64, kind: 'crown' },
  { x: 14, z: 64, kind: 'setback' }
]

/** 墙面窗户贴图：墙体底色 + 网格窗户 */
function makeFacade({ rand, cols, rows, wall, win, lit, litRate }) {
  const W = 128
  const H = 128
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const glow = document.createElement('canvas')
  glow.width = W
  glow.height = H
  const glowCtx = glow.getContext('2d')

  ctx.fillStyle = wall
  ctx.fillRect(0, 0, W, H)

  const cw = W / cols
  const ch = H / rows
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const on = rand() < litRate
      ctx.fillStyle = on ? lit[Math.floor(rand() * lit.length)] : win
      const x = i * cw + cw * 0.2
      const y = r * ch + ch * 0.26
      ctx.fillRect(x, y, cw * 0.6, ch * 0.46)
      if (on) {
        glowCtx.fillStyle = ctx.fillStyle
        glowCtx.fillRect(x, y, cw * 0.6, ch * 0.46)
      }
    }
  }

  return [c, glow].map((canvas) => {
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    return tex
  })
}

/** 商务塔楼立面：玻璃、层间板与金属窗框分别有颜色和粗糙度。 */
function skylineFacade({ rand, cols, rows, wall, glass, lit }) {
  // 近景每扇窗保留约 128×128 像素；两套高层材质共享，避免逐栋分配。
  const width = 1024
  const height = 2048
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  })
  const [color, glow, roughness] = canvases.map((canvas) => canvas.getContext('2d'))
  const cw = width / cols
  const ch = height / rows
  color.fillStyle = wall
  color.fillRect(0, 0, width, height)
  roughness.fillStyle = '#d8d8d8'
  roughness.fillRect(0, 0, width, height)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw
      const y = row * ch
      const litWindow = rand() < 0.18
      const paneX = x + cw * 0.035
      const paneY = y + ch * 0.045
      const paneW = cw * 0.93
      const paneH = ch * 0.78

      // 暗色凹槽与窄窗框让每一层有真实厚度，底部留出层间板。
      color.fillStyle = '#182a36'
      color.fillRect(x + cw * 0.02, y + ch * 0.025, cw * 0.96, ch * 0.82)
      // 整面连续的天空色调，角度相关的云与太阳反射交给场景环境贴图。
      const reflection = color.createLinearGradient(0, 0, 0, height)
      reflection.addColorStop(0, '#91aebc')
      reflection.addColorStop(0.42, glass)
      reflection.addColorStop(1, '#243f50')
      color.fillStyle = reflection
      color.fillRect(paneX, paneY, paneW, paneH)
      color.fillStyle = litWindow ? 'rgba(211, 198, 159, 0.18)' : `rgba(12, 30, 42, ${0.025 + (col % 3) * 0.025})`
      color.fillRect(paneX, paneY, paneW, paneH)
      color.fillStyle = 'rgba(12, 30, 42, 0.65)'
      color.fillRect(x, y + ch * 0.86, cw, ch * 0.025)
      color.fillStyle = wall
      color.fillRect(x + cw * 0.494, paneY, cw * 0.012, paneH)
      color.fillStyle = 'rgba(218, 231, 236, 0.65)'
      color.fillRect(paneX, paneY, paneW, 1.5)
      color.fillRect(paneX, paneY, 1.5, paneH)

      roughness.fillStyle = '#404040'
      roughness.fillRect(paneX, paneY, paneW, paneH)
      roughness.fillStyle = '#b8b8b8'
      roughness.fillRect(x + cw * 0.494, paneY, cw * 0.012, paneH)
      if (litWindow) {
        glow.fillStyle = lit
        glow.fillRect(paneX + 3, paneY + 3, paneW / 2 - cw * 0.012 - 6, paneH - 6)
        glow.fillRect(x + cw * 0.506 + 3, paneY + 3, paneW / 2 - cw * 0.012 - 6, paneH - 6)
      }
    }
  }

  return canvases.map((canvas) => {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = canvas === canvases[2] ? THREE.NoColorSpace : THREE.SRGBColorSpace
    texture.anisotropy = 16
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    return texture
  })
}

/** 观景球赤道窗带：浅色窗框包住深色玻璃，只有少数窗户在夜间发光。 */
function pearlWindowFacade(rand) {
  const width = 1024
  const height = 128
  const canvases = Array.from({ length: 2 }, () => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  })
  const [color, glow] = canvases.map((canvas) => canvas.getContext('2d'))
  color.fillStyle = '#d4d9d9'
  color.fillRect(0, 0, width, height)
  const windowWidth = width / 48
  const windowHeight = height / 2
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 48; col++) {
      const x = col * windowWidth + 2
      const y = row * windowHeight + 7
      const lit = rand() < 0.12
      color.fillStyle = lit ? '#aab8b3' : '#304e5e'
      color.fillRect(x, y, windowWidth - 4, windowHeight - 14)
      if (lit) {
        glow.fillStyle = '#b8c9c4'
        glow.fillRect(x, y, windowWidth - 4, windowHeight - 14)
      }
    }
  }
  return canvases.map((canvas) => {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  })
}

/** 基座入口题名：深色匾额配暖金字，四面入口共用一张贴图。 */
function pearlNameMaterial() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 192
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#203c49'
  ctx.fillRect(0, 0, 1024, 192)
  ctx.strokeStyle = '#c5aa76'
  ctx.lineWidth = 4
  ctx.strokeRect(12, 12, 1000, 168)
  ctx.fillStyle = '#eed9a6'
  ctx.font = '600 112px "Songti SC", "Noto Serif CJK SC", serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('东方明珠', 512, 102)
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 8
  return new THREE.MeshBasicMaterial({ map })
}

function skylineMaterial(facade) {
  const [map, emissiveMap, roughnessMap] = facade
  return new THREE.MeshPhysicalMaterial({
    map,
    emissiveMap,
    roughnessMap,
    bumpMap: roughnessMap,
    bumpScale: 0.065,
    emissive: '#ffffff',
    emissiveIntensity: 0.32,
    roughness: 0.72,
    metalness: 0.28,
    clearcoat: 0.55,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.15
  })
}

/** 墙身：只让点亮的窗户自发光 */
function wallMaterial([map, emissiveMap], emissiveIntensity, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    map,
    emissiveMap,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity,
    roughness,
    metalness
  })
}

function roofMaterial(color, roughness = 0.92, metalness = 0.08) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

/** 组装 6 面材质：墙身 4 面 + 顶/底 */
function boxFaces(wall, roof) {
  return [wall, wall, roof, roof, wall, wall]
}

// ---------- 三类体量的生成器 ----------
// bx / bz 是街区中心的世界坐标，体量直接在它周围摆开。

/** 住宅：1~2 栋板楼 + 深色女儿墙顶帽。市中心 7.5~12，郊区 5.2~8.8 */
function addResidential({ add, rand, mats, detailMat, bx, bz, inCbd }) {
  const mat = mats[Math.floor(rand() * mats.length)]
  const units = rand() < 0.42 ? 2 : 1
  const gap = 5

  for (let u = 0; u < units; u++) {
    const offset = units === 1 ? 0 : (u - 0.5) * gap
    const w = units === 1 ? 5.4 + rand() * 1.8 : 4.2 + rand() * 1.0
    const d = units === 1 ? 5.4 + rand() * 1.6 : 4.4 + rand() * 1.0
    const h = inCbd ? 7.5 + rand() * 4.5 : 5.2 + rand() * 3.6

    add('box', mat, [bx + offset, h / 2, bz], [w, h, d])
    add('box', detailMat, [bx + offset, h + 0.18, bz], [w * 0.94, 0.36, d * 0.94])
  }
}

/** 商场：单栋低矮大体量 + 屋顶设备箱 + 发光招牌板 */
function addMall({ add, rand, mats, detailMat, signMat, bx, bz }) {
  const mat = mats[Math.floor(rand() * mats.length)]
  const w = 8.2 + rand() * 1.9
  const d = 7.4 + rand() * 2.1
  const h = 4.4 + rand() * 2.6

  add('box', mat, [bx, h / 2, bz], [w, h, d])
  add('box', detailMat, [bx + w * 0.22, h + 0.5, bz - d * 0.18], [w * 0.34, 1, d * 0.3])
  add('box', signMat, [bx, h + 0.75, bz - d / 2 + 0.4], [w * 0.62, 1.5, 0.18])
}

/** 工厂：1~2 座低矮长条厂房 + 烟囱 */
function addFactory({ add, rand, mats, chimneyMat, bx, bz }) {
  const mat = mats[Math.floor(rand() * mats.length)]
  const sheds = rand() < 0.55 ? 2 : 1

  for (let s = 0; s < sheds; s++) {
    const offset = sheds === 1 ? 0 : (s - 0.5) * 5
    const w = sheds === 1 ? 8.2 + rand() * 1.6 : 4.4 + rand() * 0.8
    const h = 3.0 + rand() * 1.4
    const d = 5.8 + rand() * 2.0
    add('box', mat, [bx + offset, h / 2, bz], [w, h, d])
  }

  const chimneyH = 5.5 + rand() * 3
  add('cyl', chimneyMat, [bx + (rand() - 0.5) * 3, chimneyH / 2, bz + 2], [0.7, chimneyH, 0.7])
}

/** 中央商务区的特色高层；大疆双塔占用中间横向展开的独立地块。 */
function addSkyline(addMesh, mats) {
  const { glass, pale, metal, pearl, pearlRose, pearlFrame, pearlConcrete, pearlJoint, pearlShaftGlass, pearlBracket, pearlTop, pearlAntenna, pearlWindows, accent, glow } = mats
  const box = (mat, x, y, z, w, h, d) => {
    addMesh('box', mat, [x, y, z], [w, h, d])
    if ((mat === glass || mat === pale) && h >= 10) {
      // 实体转角压条在近景产生真实轮廓与高光，复用金属材质和实例批次。
      for (const dx of [-w / 2, w / 2]) {
        for (const dz of [-d / 2, d / 2]) {
          addMesh('box', metal, [x + dx, y, z + dz], [0.12, h + 0.04, 0.12])
        }
      }
    }
  }

  for (const { x, z, kind } of SKYLINE_SITES) {
    if (kind === 'pearl') {
      const { pearlStone, pearlBaseGlass, pearlName } = mats
      // 横向受相邻楼宇约束，纵向展开为更宽裕的地标基座。
      const podium = (mat, dx, y, dz, w, h, d, angle = 0) => addMesh('box', mat,
        [x + dx * 1.15, y, z + dz * 1.3],
        angle % Math.PI === 0 ? [w * 1.15, h, d * 1.3] : [w * 1.3, h, d * 1.15], [0, angle, 0])
      // 石材台基、退进玻璃窗与挑檐，替代普通办公楼式的密集窗格。
      podium(pearlStone, 0, 0.25, 0, 24, 0.5, 24)
      podium(pearlStone, 0, 2.15, 0, 23, 3.3, 23)
      podium(pearlFrame, 0, 3.85, 0, 23.6, 0.2, 23.6)
      podium(pearlStone, 0, 4.1, 0, 24, 0.4, 24)
      for (let side = 0; side < 4; side++) {
        const angle = side * Math.PI / 2
        const facade = (mat, dx, y, dz, w, h, d) => podium(mat,
          dx * Math.cos(angle) + dz * Math.sin(angle), y, -dx * Math.sin(angle) + dz * Math.cos(angle),
          w, h, d, angle)
        for (const offset of [-8.2, -4.2, 4.2, 8.2]) {
          facade(pearlBaseGlass, offset, 1.95, 11.52, 3.2, 1.9, 0.08)
          facade(pearlFrame, offset, 1.95, 11.59, 0.07, 1.9, 0.08)
          facade(pearlStone, offset, 0.96, 11.64, 3.4, 0.12, 0.3)
        }
        // 中央双扇门、金属门框、入口雨棚与三级踏步。
        facade(pearlBaseGlass, 0, 1.65, 11.56, 3.5, 2.3, 0.12)
        for (const offset of [-1.85, 0, 1.85]) {
          facade(pearlFrame, offset, 1.65, 11.68, 0.1, 2.4, 0.15)
        }
        facade(pearlName, 0, 3.28, 11.66, 7, 1.05, 0.12)
        facade(pearlFrame, 0, 2.78, 12.05, 5, 0.14, 1.4)
        for (let step = 0; step < 3; step++) {
          facade(pearlStone, 0, 0.08 + step * 0.08, 12.65 - step * 0.3, 5.4, 0.16 + step * 0.16, 0.9)
        }
        facade(pearlStone, 0, 4.47, 11.8, 23.9, 0.34, 0.22)
      }
    } else if (kind === 'dji') {
      // 两座独立的架高平台，中间保留贯通的步行轴线。
      for (const side of [-1, 1]) {
        const px = x + side * 12
        box(mats.pearlStone, px, 1.25, z, 20, 2.5, 25)
        box(glass, px, 1.5, z + 12.53, 12, 1.8, 0.08)
        box(mats.djiFrame, px, 2.7, z, 20.3, 0.4, 25.3)
        for (const edge of [-1, 1]) {
          box(mats.pearlStone, px + edge * 8.7, 3.05, z, 1.4, 0.4, 23)
          box(mats.djiGreen, px + edge * 8.7, 3.33, z, 1.2, 0.3, 22)
        }
        for (const dz of [-10, 10]) {
          for (const dx of [-7, 7]) {
            box(mats.djiCore, px + dx, 3.7, z + dz, 0.16, 1.7, 0.16)
            addMesh('sphere', mats.djiGreen, [px + dx, 4.8, z + dz], [1.6, 1.8, 1.6])
          }
        }
        for (let step = 0; step < 5; step++) {
          box(mats.pearlStone, px, 0.25 + step * 0.25, z + 14 - step * 0.3, 7, 0.5 + step * 0.5, 0.7)
        }
      }
    } else {
      box(pale, x, 2, z, 23, 4, 23)
      box(accent, x, 4.15, z, 23.5, 0.3, 23.5)
    }
    // 东方明珠从裙房顶面等比放大，保持球体、斜撑和塔身比例，突出最高地标。
    const landmarkScale = kind === 'pearl' ? 1.35 : 1
    const add = (geoKey, material, position, scale, rotation) => addMesh(
      geoKey, material,
      [x + (position[0] - x) * landmarkScale, 4.3 + (position[1] - 4.3) * landmarkScale, z + (position[2] - z) * landmarkScale],
      scale.map((value) => value * landmarkScale), rotation
    )
    const cyl = (mat, x, y, z, diameter, h) => add('cyl', mat, [x, y, z], [diameter, h, diameter])
    if (kind === 'pearl') {
      // 下方主球由粗壮中心塔柱和三根外伸斜撑承托；中段球形节点再向塔柱回撑。
      // 承台下缘埋入屋面，收分至塔柱，避免柱脚像直接摆在屋顶上。
      cyl(pearlConcrete, x, 4.15, z, 7.2, 0.7)
      add('taper', pearlConcrete, [x, 4.95, z], [6.6, 1.6, 6.6])
      add('pearlColumn', pearlConcrete, [x, 10.5, z], [3.3, 13, 3.3])
      const windowFace = Math.PI / 4
      add('box', pearlShaftGlass,
        [x + Math.sin(windowFace) * 1.66, 8.8, z + Math.cos(windowFace) * 1.66],
        [0.6, 5.8, 0.1], [0, windowFace, 0])
      const supportBeam = (material, start, end, diameter) => {
        const direction = end.clone().sub(start)
        const tilt = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), direction.clone().normalize()
        )
        add('pearlColumn', material, start.clone().add(end).multiplyScalar(0.5).toArray(),
          [diameter, direction.length(), diameter],
          new THREE.Euler().setFromQuaternion(tilt).toArray().slice(0, 3))
      }
      const supportAngle = -0.6
      for (let i = 0; i < 3; i++) {
        const angle = supportAngle + (i * Math.PI * 2) / 3
        const start = new THREE.Vector3(x + Math.cos(angle) * 8.2, 3.65, z + Math.sin(angle) * 8.2)
        const end = new THREE.Vector3(x + Math.cos(angle) * 2.2, 17, z + Math.sin(angle) * 2.2)
        const joint = start.clone().lerp(end, 0.38)
        cyl(pearlConcrete, start.x, 4.05, start.z, 4.8, 0.6)
        add('taper', pearlConcrete, [start.x, 4.65, start.z], [4.3, 1.2, 4.3])
        supportBeam(pearlConcrete, start, end, 1.85)
        add('sphere', pearlJoint, joint.toArray(), [2.45, 2.45, 2.45])
        supportBeam(pearlConcrete, joint,
          new THREE.Vector3(x + Math.cos(angle) * 1.2, 5.9, z + Math.sin(angle) * 1.2), 0.82)
      }

      // 两颗主球之间是三根独立立柱，中央依次悬置五颗小球。
      for (let i = 0; i < 3; i++) {
        const angle = supportAngle + (i * Math.PI * 2) / 3
        cyl(pearlFrame, x + Math.cos(angle) * 2.25, 35, z + Math.sin(angle) * 2.25, 1.15, 27)
      }
      for (const height of [27, 31, 35, 39, 43]) {
        add('sphere', pearl, [x, height, z], [2.3, 2.3, 2.3])
        add('upperDome', pearlRose, [x, height, z], [2.3, 2.3, 2.3])
        add('smallWindows', pearlWindows, [x, height, z], [2.3, 2.3, 2.3])
        // 平台穿过球体中心，三根短支臂从中心高度接入外侧立柱。
        cyl(pearlBracket, x, height, z, 3, 0.18)
        for (let i = 0; i < 3; i++) {
          const angle = supportAngle + (i * Math.PI * 2) / 3
          const direction = new THREE.Vector3(Math.cos(angle) * 2.25, 0, Math.sin(angle) * 2.25)
          const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
          add('cyl', pearlBracket, [x + direction.x / 2, height, z + direction.z / 2],
            [0.32, direction.length(), 0.32], new THREE.Euler().setFromQuaternion(tilt).toArray().slice(0, 3))
        }
      }

      add('sphere', pearl, [x, 18, z], [11, 11, 11])
      add('pearlBelt', pearlRose, [x, 18, z], [11, 11, 11])
      add('windowBand', pearlWindows, [x, 18, z], [11.08, 1.35, 11.08])
      add('sphere', pearl, [x, 51, z], [8, 8, 8])
      add('upperDome', pearlRose, [x, 51, z], [8, 8, 8])
      add('windowBand', pearlWindows, [x, 51, z], [8.08, 1.05, 8.08])

      // 顶部照片中的收分塔颈、环纹小球和带两处节点的细长天线。
      add('taper', pearlFrame, [x, 56.5, z], [2, 3, 2])
      cyl(pearlAntenna, x, 60.9, z, 0.62, 5.8)
      for (let height = 58.7; height < 63.5; height += 0.6) {
        cyl(pearlBracket, x, height, z, 0.82, 0.11)
      }
      add('sphere', pearlTop, [x, 65, z], [2.4, 2.4, 2.4])
      add('upperDome', pearlRose, [x, 65, z], [2.4, 2.4, 2.4])
      for (const height of [64.8, 65.25]) {
        cyl(pearlAntenna, x, height, z, 2.42, 0.14)
      }
      cyl(pearlAntenna, x, 68.1, z, 0.42, 3.9)
      cyl(pearlAntenna, x, 70.1, z, 0.9, 0.28)
      cyl(pearlAntenna, x, 73.1, z, 0.27, 6)
      cyl(pearlAntenna, x, 76.15, z, 0.7, 0.23)
      cyl(pearlAntenna, x, 79.7, z, 0.13, 7)
      cyl(pearlAntenna, x, 83.5, z, 0.055, 1.1)
    } else if (kind === 'dji') {
      const frame = mats.djiFrame
      const frameBeam = (start, end, width = 0.26) => {
        const direction = end.clone().sub(start)
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
        add('box', frame, start.clone().add(end).multiplyScalar(0.5).toArray(),
          [width, direction.length(), width], new THREE.Euler().setFromQuaternion(rotation).toArray().slice(0, 3))
      }
      // 内侧宽体块朝向中央庭院，外侧窄体块后退，露出通高的金属核心筒。
      for (const side of [-1, 1]) {
        const coreX = x + side * 12
        const coreTop = side === -1 ? 80 : 88
        box(mats.djiCore, coreX, (coreTop + 2.9) / 2, z, 4.4, coreTop - 2.9, 5.2)
        for (let flute = -5; flute <= 5; flute++) {
          for (const face of [-1, 1]) {
            box(frame, coreX + flute * 0.4, (coreTop + 2.9) / 2, z + face * 2.68, 0.09, coreTop - 2.9, 0.18)
            box(frame, coreX + face * 2.28, (coreTop + 2.9) / 2, z + flute * 0.48, 0.18, coreTop - 2.9, 0.09)
          }
        }
        for (const front of [-1, 1]) {
          for (let tier = 0; tier < 2; tier++) {
            const inner = front === 1
            const bottom = (tier === 0 ? 7 : 40) + (inner ? 5 : 0)
            const height = tier === 0 ? 24 : (side === 1 ? 33 : 29)
            const cx = coreX + side * (inner ? -5.4 : 4.1)
            const cz = z + (inner ? 2.8 : -3.2)
            const w = inner ? 8.4 : 6.4
            const d = 6.8
            const top = bottom + height
            box(glass, cx, bottom + height / 2, cz, w, height, d)
            box(mats.djiCore, cx, bottom - 0.18, cz, w - 0.3, 0.35, d - 0.3)
            // 细幕墙分格与粗外骨架分开，避免远近景都只剩粗白框。
            for (const face of [-1, 1]) {
              for (let col = 1; col < 8; col++) {
                box(metal, cx - w / 2 + w * col / 8, bottom + height / 2, cz + face * (d / 2 + 0.025), 0.035, height, 0.045)
              }
              for (let floor = 1; floor < 16; floor++) {
                box(metal, cx, bottom + height * floor / 16, cz + face * (d / 2 + 0.025), w, 0.04, 0.045)
              }
            }
            for (const dx of [-w / 2, w / 2]) {
              for (const dz of [-d / 2, d / 2]) {
                box(frame, cx + dx, bottom + height / 2, cz + dz, 0.24, height, 0.24)
              }
            }
            for (const y of [bottom, top - 7, top]) {
              for (const dz of [-d / 2, d / 2]) box(frame, cx, y, cz + dz, w + 0.24, y === bottom ? 0.45 : 0.28, 0.26)
              for (const dx of [-w / 2, w / 2]) box(frame, cx + dx, y, cz, 0.26, y === bottom ? 0.45 : 0.28, d)
            }
            const faceZ = cz + front * (d / 2 + 0.14)
            box(frame, cx, bottom + height / 2, faceZ, 0.22, height, 0.26)
            for (const dx of [-w / 2, w / 2]) {
              frameBeam(new THREE.Vector3(cx + dx, top, faceZ), new THREE.Vector3(cx, top - 7, faceZ), 0.3)
            }
            const faceX = cx + side * (inner ? -1 : 1) * (w / 2 + 0.14)
            frameBeam(new THREE.Vector3(faceX, top, cz - d / 2), new THREE.Vector3(faceX, top - 7, cz + d / 2), 0.3)
          }
        }
      }
      // 轻薄连桥横穿上下悬挑体之间的留空层，两侧配置通透栏杆。
      box(frame, x, 40.2, z, 24, 0.35, 2.6)
      for (const dz of [-1.3, 1.3]) {
        box(metal, x, 41.4, z + dz, 24, 0.08, 0.08)
        for (let dx = -12; dx <= 12; dx += 1.5) {
          box(frame, x + dx, 40.8, z + dz, 0.055, 1.2, 0.055)
        }
      }
    } else if (kind === 'shanghai') {
      // 共用同一套扭转曲面，楼层线与三条螺旋收边始终贴合幕墙。
      add('shanghaiShell', mats.shanghaiGlass, [x, 4.3, z], [18, 96, 18])
      add('shanghaiBands', metal, [x, 4.3, z], [18, 96, 18])
      add('shanghaiRibs', metal, [x, 4.3, z], [18, 96, 18])
      // 塔冠内部退低的屋面，保留上部玻璃围屏的斜切轮廓。
      cyl(metal, x, 94.1, z, 7.4, 0.25)
      box(glass, x, 2.4, z, 20, 3.6, 19)
      box(metal, x, 4.25, z, 20.6, 0.16, 19.6)
    } else if (kind === 'setback') {
      // 层层收分的玻璃办公塔。
      box(glass, x, 16, z, 19, 24, 18)
      box(pale, x, 35, z, 15.5, 14, 14.5)
      box(glass, x, 47, z, 11.5, 10, 10.5)
      box(glow, x, 52.4, z, 12, 0.8, 11)
      cyl(metal, x, 57, z, 0.8, 9)
    } else if (kind === 'twins') {
      // 双塔连桥，两个细长体量之间保持可见缝隙。
      for (const dx of [-6.5, 6.5]) {
        box(glass, x + dx, 27, z, 8.5, 46, 14)
        box(accent, x + dx, 51, z, 9, 2, 14.5)
        cyl(metal, x + dx, 56, z, 0.7, 8)
      }
      box(pale, x, 35, z, 5.5, 3, 12)
    } else if (kind === 'spire') {
      // 八角塔身与锥顶，区别于方形住宅楼。
      cyl(glass, x, 21, z, 17, 34)
      add('cone', accent, [x, 46, z], [17.5, 16, 17.5])
      cyl(metal, x, 60, z, 1, 14)
      add('sphere', glow, [x, 68, z], [1.8, 1.8, 1.8])
    } else {
      // 冠顶塔：方形主楼、逐级上收的浅色塔冠。
      box(pale, x, 22, z, 18, 36, 18)
      box(glass, x, 43, z, 15, 6, 15)
      box(accent, x, 47, z, 13, 2, 13)
      add('cone', metal, [x, 53, z], [13, 10, 13])
    }
  }
}

/**
 * 生成全城建筑。
 * @returns {{ meshes: Array, geometries: object, lightMaterials: Array, modelSites: Array }}
 *   modelSites：改用真实模型的街区站点（x/z/key/rotationY），由 Buildings 组件渲染
 */
export function generateCity(seed = 20261012) {
  const rand = mulberry32(seed)
  const skylineRand = mulberry32(seed ^ 0x5a17)
  const geometries = { box: UNIT_BOX, cyl: UNIT_CYL, pearlColumn: UNIT_PEARL_COLUMN, sphere: UNIT_SPHERE, upperDome: UNIT_UPPER_DOME, pearlBelt: UNIT_PEARL_BELT, smallWindows: UNIT_SMALL_WINDOWS, cone: UNIT_CONE, taper: UNIT_TAPER, windowBand: UNIT_WINDOW_BAND, ...SHANGHAI_GEOMETRIES }

  // ---- 各类型配色变体 ----
  const residentialMats = [
    { wall: '#c3bcae', lit: ['#ffd98a', '#ffeccb', '#d8e8ff'] },
    { wall: '#b3aba2', lit: ['#ffcf72', '#ffe0b0', '#cfe3ff'] }
  ].map((v) =>
    boxFaces(
      wallMaterial(
        makeFacade({ rand, cols: 5, rows: 8, wall: v.wall, win: '#2b3138', lit: v.lit, litRate: 0.42 }),
        0.36,
        0.88,
        0.04
      ),
      roofMaterial('#6f6a63', 0.95, 0.05)
    )
  )

  const mallMats = [
    { wall: '#4a5a6e', lit: ['#bfe0ff', '#e8f4ff', '#ffd98a'] },
    { wall: '#405060', lit: ['#cfe8ff', '#eef7ff', '#ffe1a6'] }
  ].map((v) =>
    boxFaces(
      wallMaterial(
        makeFacade({ rand, cols: 9, rows: 4, wall: v.wall, win: '#1d2733', lit: v.lit, litRate: 0.55 }),
        0.5,
        0.26,
        0.5
      ),
      roofMaterial('#98a1ab', 0.85, 0.18)
    )
  )

  const factoryMats = [
    { wall: '#8a929c' },
    { wall: '#7e8792' },
    { wall: '#939ba5' }
  ].map((v) =>
    boxFaces(
      wallMaterial(
        makeFacade({ rand, cols: 8, rows: 2, wall: v.wall, win: '#2e3742', lit: ['#e9f2ff', '#cfe3ff'], litRate: 0.5 }),
        0.3,
        0.62,
        0.42
      ),
      roofMaterial('#6f7883', 0.7, 0.5)
    )
  )

  const detailMat = new THREE.MeshStandardMaterial({ color: '#5f594f', roughness: 0.95 })
  const chimneyMat = new THREE.MeshStandardMaterial({ color: '#9aa4b0', roughness: 0.7, metalness: 0.35 })
  const signMat = new THREE.MeshStandardMaterial({
    color: '#8fd8ff',
    emissive: new THREE.Color('#7fd4ff'),
    emissiveIntensity: 1.5,
    roughness: 0.35,
    metalness: 0.1
  })
  const pearlWindows = pearlWindowFacade(skylineRand)
  const shanghaiGlass = skylineMaterial(skylineFacade({ rand: skylineRand, cols: 24, rows: 120, wall: '#6f8794', glass: '#3f6278', lit: '#b7cbd2' }))
  shanghaiGlass.side = THREE.DoubleSide
  const skylineMats = {
    djiCore: new THREE.MeshStandardMaterial({ color: '#90999f', roughness: 0.65, metalness: 0.35 }),
    djiFrame: new THREE.MeshStandardMaterial({ color: '#ccd0cc', roughness: 0.38, metalness: 0.65 }),
    djiGreen: new THREE.MeshStandardMaterial({ color: '#53764a', roughness: 0.95 }),
    shanghaiGlass,
    glass: boxFaces(skylineMaterial(skylineFacade({ rand: skylineRand, cols: 8, rows: 16, wall: '#547285', glass: '#284a62', lit: '#a3c7d4' })), roofMaterial('#485f6d', 0.56, 0.36)),
    pale: boxFaces(skylineMaterial(skylineFacade({ rand: skylineRand, cols: 7, rows: 14, wall: '#aab9b9', glass: '#54788b', lit: '#d9cfb3' })), roofMaterial('#899d9f', 0.62, 0.28)),
    metal: new THREE.MeshStandardMaterial({ color: '#b5c1c9', roughness: 0.3, metalness: 0.72 }),
    pearl: new THREE.MeshStandardMaterial({ color: '#b5b8b7', roughness: 1, metalness: 0 }),
    pearlRose: new THREE.MeshStandardMaterial({ color: '#a96785', roughness: 1, metalness: 0 }),
    pearlFrame: new THREE.MeshStandardMaterial({ color: '#b5c4ca', roughness: 0.9, metalness: 0 }),
    pearlStone: new THREE.MeshStandardMaterial({ color: '#c9c4b7', roughness: 0.88, metalness: 0 }),
    pearlBaseGlass: new THREE.MeshStandardMaterial({ color: '#294b5a', roughness: 0.3, metalness: 0.45 }),
    pearlName: pearlNameMaterial(),
    pearlConcrete: new THREE.MeshStandardMaterial({ color: '#899391', roughness: 1, metalness: 0 }),
    pearlJoint: new THREE.MeshStandardMaterial({ color: '#b4bec0', roughness: 0.92, metalness: 0 }),
    pearlShaftGlass: new THREE.MeshStandardMaterial({ color: '#213d49', roughness: 0.72, metalness: 0 }),
    pearlBracket: new THREE.MeshStandardMaterial({ color: '#849198', roughness: 1, metalness: 0 }),
    pearlTop: new THREE.MeshStandardMaterial({ color: '#8297a8', roughness: 0.9, metalness: 0 }),
    pearlAntenna: new THREE.MeshStandardMaterial({ color: '#4b657d', roughness: 0.85, metalness: 0 }),
    pearlWindows: new THREE.MeshStandardMaterial({ map: pearlWindows[0], emissiveMap: pearlWindows[1], emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 0.85, metalness: 0 }),
    accent: new THREE.MeshStandardMaterial({ color: '#80a8b4', roughness: 0.3, metalness: 0.58 }),
    glow: new THREE.MeshStandardMaterial({ color: '#b6eaff', emissive: '#83d9f5', emissiveIntensity: 0.8, roughness: 0.3, metalness: 0.28 })
  }

  const meshes = []
  const modelSites = []
  const add = (geoKey, material, position, scale, rotation = null) => meshes.push({ geoKey, material, position, scale, rotation })

  const BLOCKS = GRID_N

  // 先生成原城区，再生成扩展区，保持原有楼宇的随机布局不变。
  for (const expanded of [false, true]) {
    for (let n = 0; n < BLOCKS; n++) {
      for (let row = 0; row < (expanded ? EXTRA_Z_BLOCKS : BLOCKS); row++) {
        const m = expanded ? -row - 1 : row
        const bx = blockCenterX(n)
        const bz = blockCenterZ(m)
        // 为大疆总部整块预留占地，避免与原有随机住宅模型重叠。
        if (SKYLINE_SITES.some((site) => site.kind === 'dji' && Math.abs(bx - site.x) <= 26 && Math.abs(bz - site.z) <= 18)) continue
        if (Object.values(EAST_SITES).some((site) => inArea(bx, bz, site, 8))) continue
        const zone = cityZone(bx, bz)
        if (zone !== 'residential') continue
        if (rand() < SKIP_RATE) continue // 留空
        // 部分街区交给真实楼宇模型：款式 / 微偏移 / 朝向都用同一个 rand 决定，保持可复现
        if (rand() < MODEL_BLOCK_RATE) {
          modelSites.push({
            x: bx + (rand() - 0.5) * 0.6,
            z: bz + (rand() - 0.5) * 0.6,
            key: MODEL_KEYS[Math.floor(rand() * MODEL_KEYS.length)],
            rotationY: Math.floor(rand() * 4) * (Math.PI / 2)
          })
          continue
        }
        addResidential({ add, rand, mats: residentialMats, detailMat, bx, bz, inCbd: false })
      }
    }
  }

  addSkyline(add, skylineMats)

  const lightMaterials = [...residentialMats, ...mallMats, ...factoryMats]
    .map((faces) => faces[0])
    .concat(signMat, skylineMats.glass[0], skylineMats.pale[0], skylineMats.shanghaiGlass, skylineMats.pearlWindows, skylineMats.glow)
    .map((material) => ({ material, baseIntensity: material.emissiveIntensity }))

  return { meshes, geometries, lightMaterials, modelSites }
}
