// ============================================================
//  城市建筑：按功能区生成 住宅 / 商场 / 工厂 三类体量
//  - 全部复用 1×1×1 立方体（烟囱用单位圆柱），靠 scale 变形
//  - 每类用「6 面材质数组」区分墙身与屋顶（BoxGeometry 分组顺序 +x -x +y -y +z -z）
//  - 落位走 cityLayout 的街区中心，与道路网格严格对齐（横平竖直）
// ============================================================
import * as THREE from 'three'
import { blockCenterX, blockCenterZ, mulberry32 } from './cityLayout'

export const TYPE = {
  RESIDENTIAL: 'residential',
  MALL: 'mall',
  FACTORY: 'factory'
}

/** 中心商业区半径（切比雪夫距离）。<= 该值为市区，> 为外围工业区 */
export const CBD_RADIUS = 52

const SKIP_RATE = 0.28 // 街区留空比例（绿地 / 停车场）
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12)

/** 墙面窗户贴图：墙体底色 + 网格窗户 */
function makeFacade({ rand, cols, rows, wall, win, lit, litRate }) {
  const W = 128
  const H = 128
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')

  ctx.fillStyle = wall
  ctx.fillRect(0, 0, W, H)

  const cw = W / cols
  const ch = H / rows
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < cols; i++) {
      const on = rand() < litRate
      ctx.fillStyle = on ? lit[Math.floor(rand() * lit.length)] : win
      ctx.fillRect(i * cw + cw * 0.2, r * ch + ch * 0.26, cw * 0.6, ch * 0.46)
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

/** 墙身：窗户贴图同时当自发光贴图，夜景窗户自己亮 */
function wallMaterial(tex, emissiveIntensity, roughness, metalness) {
  return new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
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
  const gap = 5.4

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
    const offset = sheds === 1 ? 0 : (s - 0.5) * 5.2
    const w = sheds === 1 ? 8.2 + rand() * 1.6 : 4.4 + rand() * 0.8
    const h = 3.0 + rand() * 1.4
    const d = 5.8 + rand() * 2.0
    add('box', mat, [bx + offset, h / 2, bz], [w, h, d])
  }

  const chimneyH = 5.5 + rand() * 3
  add('cyl', chimneyMat, [bx + (rand() - 0.5) * 3, chimneyH / 2, bz + 2], [0.7, chimneyH, 0.7])
}

/**
 * 生成全城建筑。
 * @returns {{ meshes: Array, geometries: { box, cyl } }}
 */
export function generateCity(seed = 20261012) {
  const rand = mulberry32(seed)
  const geometries = { box: UNIT_BOX, cyl: UNIT_CYL }

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

  const meshes = []
  const add = (geoKey, material, position, scale) => meshes.push({ geoKey, material, position, scale })

  const BLOCKS = 12 // 每轴 12 个街区（n = 0..11）

  for (let n = 0; n < BLOCKS; n++) {
    for (let m = 0; m < BLOCKS; m++) {
      const bx = blockCenterX(n)
      const bz = blockCenterZ(m)
      const radius = Math.max(Math.abs(bx), Math.abs(bz))

      if (radius < 15) continue // 中心广场（树阵）
      if (rand() < SKIP_RATE) continue // 留空

      const inCbd = radius <= CBD_RADIUS
      const roll = rand()
      const type = inCbd
        ? roll < 0.45
          ? TYPE.MALL
          : TYPE.RESIDENTIAL
        : roll < 0.58
          ? TYPE.FACTORY
          : TYPE.RESIDENTIAL

      if (type === TYPE.MALL) {
        addMall({ add, rand, mats: mallMats, detailMat, signMat, bx, bz })
      } else if (type === TYPE.FACTORY) {
        addFactory({ add, rand, mats: factoryMats, chimneyMat, bx, bz })
      } else {
        addResidential({ add, rand, mats: residentialMats, detailMat, bx, bz, inCbd })
      }
    }
  }

  return { meshes, geometries }
}
