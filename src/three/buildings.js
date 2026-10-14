// ============================================================
//  城市建筑：按功能区生成住宅 / 商场 / 工厂，并在中心区布置特色高层
//  - 几何体复用，靠 scale 变形；高层也按街区中心落位
//  - 每类用「6 面材质数组」区分墙身与屋顶（BoxGeometry 分组顺序 +x -x +y -y +z -z）
//  - 落位走 cityLayout 的街区中心，与道路网格严格对齐（横平竖直）
// ============================================================
import * as THREE from 'three'
import { GRID_N, EAST_SITES, blockCenterX, blockCenterZ, cityZone, inArea, mulberry32 } from './cityLayout'

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

// 中央公园东侧的 2×3 个连续大地块；每块跨 2×2 个原有小楼格心。
const SKYLINE_SITES = [
  { x: -14, z: -64, kind: 'pearl' },
  { x: 14, z: -64, kind: 'setback' },
  { x: -14, z: 0, kind: 'twins' },
  { x: 14, z: 0, kind: 'spire' },
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
  const size = 512
  const canvases = Array.from({ length: 3 }, () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    return canvas
  })
  const [color, glow, roughness] = canvases.map((canvas) => canvas.getContext('2d'))
  const cw = size / cols
  const ch = size / rows
  color.fillStyle = wall
  color.fillRect(0, 0, size, size)
  roughness.fillStyle = '#d8d8d8'
  roughness.fillRect(0, 0, size, size)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw
      const y = row * ch
      const litWindow = rand() < 0.18
      const paneX = x + cw * 0.12
      const paneY = y + ch * 0.13
      const paneW = cw * 0.76
      const paneH = ch * 0.66

      // 暗色凹槽与窄窗框让每一层有真实厚度，底部留出层间板。
      color.fillStyle = '#182a36'
      color.fillRect(x + cw * 0.06, y + ch * 0.08, cw * 0.88, ch * 0.76)
      const reflection = color.createLinearGradient(paneX, paneY, paneX + paneW, paneY + paneH)
      reflection.addColorStop(0, litWindow ? lit : '#8caabb')
      reflection.addColorStop(0.26, litWindow ? lit : glass)
      reflection.addColorStop(0.64, litWindow ? '#617582' : '#18374b')
      reflection.addColorStop(1, litWindow ? '#41515d' : '#638397')
      color.fillStyle = reflection
      color.fillRect(paneX, paneY, paneW, paneH)
      color.fillStyle = 'rgba(220, 233, 238, 0.25)'
      color.fillRect(paneX + paneW * 0.13, paneY, paneW * 0.08, paneH)
      color.fillStyle = 'rgba(12, 30, 42, 0.55)'
      color.fillRect(x, y + ch * 0.84, cw, ch * 0.07)
      color.fillRect(x + cw * 0.48, paneY, cw * 0.04, paneH)

      roughness.fillStyle = '#555555'
      roughness.fillRect(paneX, paneY, paneW, paneH)
      if (litWindow) {
        glow.fillStyle = lit
        glow.fillRect(paneX + 2, paneY + 2, paneW - 4, paneH - 4)
      }
    }
  }

  return canvases.map((canvas) => {
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = canvas === canvases[2] ? THREE.NoColorSpace : THREE.SRGBColorSpace
    texture.anisotropy = 8
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

function skylineMaterial(facade) {
  const [map, emissiveMap, roughnessMap] = facade
  return new THREE.MeshPhysicalMaterial({
    map,
    emissiveMap,
    roughnessMap,
    emissive: '#ffffff',
    emissiveIntensity: 0.32,
    roughness: 0.72,
    metalness: 0.28,
    clearcoat: 0.32,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.85
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

/** 六个连续的大型商务地块，每座裙房占约 23×23，塔身轮廓各不相同。 */
function addSkyline(add, mats) {
  const { glass, pale, metal, pearl, pearlRose, pearlFrame, pearlConcrete, pearlJoint, pearlShaftGlass, pearlBracket, pearlTop, pearlAntenna, pearlWindows, accent, glow } = mats
  const box = (mat, x, y, z, w, h, d) => add('box', mat, [x, y, z], [w, h, d])
  const cyl = (mat, x, y, z, diameter, h) => add('cyl', mat, [x, y, z], [diameter, h, diameter])

  for (const { x, z, kind } of SKYLINE_SITES) {
    box(pale, x, 2, z, 23, 4, 23)
    box(accent, x, 4.15, z, 23.5, 0.3, 23.5)
    if (kind === 'pearl') {
      // 下方主球由粗壮中心塔柱和三根外伸斜撑承托；中段球形节点再向塔柱回撑。
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
        const start = new THREE.Vector3(x + Math.cos(angle) * 8.2, 4.3, z + Math.sin(angle) * 8.2)
        const end = new THREE.Vector3(x + Math.cos(angle) * 2.2, 17, z + Math.sin(angle) * 2.2)
        const joint = start.clone().lerp(end, 0.38)
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
  const geometries = { box: UNIT_BOX, cyl: UNIT_CYL, pearlColumn: UNIT_PEARL_COLUMN, sphere: UNIT_SPHERE, upperDome: UNIT_UPPER_DOME, pearlBelt: UNIT_PEARL_BELT, smallWindows: UNIT_SMALL_WINDOWS, cone: UNIT_CONE, taper: UNIT_TAPER, windowBand: UNIT_WINDOW_BAND }

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
  const skylineMats = {
    glass: boxFaces(skylineMaterial(skylineFacade({ rand: skylineRand, cols: 8, rows: 16, wall: '#547285', glass: '#284a62', lit: '#a3c7d4' })), roofMaterial('#485f6d', 0.56, 0.36)),
    pale: boxFaces(skylineMaterial(skylineFacade({ rand: skylineRand, cols: 7, rows: 14, wall: '#aab9b9', glass: '#54788b', lit: '#d9cfb3' })), roofMaterial('#899d9f', 0.62, 0.28)),
    metal: new THREE.MeshStandardMaterial({ color: '#b5c1c9', roughness: 0.3, metalness: 0.72 }),
    pearl: new THREE.MeshStandardMaterial({ color: '#b5b8b7', roughness: 1, metalness: 0 }),
    pearlRose: new THREE.MeshStandardMaterial({ color: '#a96785', roughness: 1, metalness: 0 }),
    pearlFrame: new THREE.MeshStandardMaterial({ color: '#b5c4ca', roughness: 0.9, metalness: 0 }),
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

  for (let n = 0; n < BLOCKS; n++) {
    for (let m = 0; m < BLOCKS; m++) {
      const bx = blockCenterX(n)
      const bz = blockCenterZ(m)
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

  addSkyline(add, skylineMats)

  const lightMaterials = [...residentialMats, ...mallMats, ...factoryMats]
    .map((faces) => faces[0])
    .concat(signMat, skylineMats.glass[0], skylineMats.pale[0], skylineMats.pearlWindows, skylineMats.glow)
    .map((material) => ({ material, baseIntensity: material.emissiveIntensity }))

  return { meshes, geometries, lightMaterials, modelSites }
}
