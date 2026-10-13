// ============================================================
//  烟囱烟羽：给火电站的烟囱加一股持续上升、随风偏斜的烟
//
//  做法：THREE.Points + 自定义 ShaderMaterial
//  · 每颗粒子的位置按「年龄」解析式求出，而不是逐帧累加位移。
//    好处有两个：一是可以把出生时间直接打散，场景一进来烟就是
//    完整的，不用等十几秒才长出来；二是掉帧或标签页切回来时不会
//    因为一次性补上巨大的 dt 而炸开。
//  · 尺寸 / 透明度 / 自转角都是逐粒子的，由顶点属性带进着色器，
//    这样才能一颗粒子一边变大一边淡出，而不是整体统一缩放。
// ============================================================
import * as THREE from 'three'

/** 烟羽参数（长度单位 = 世界米，时间 = 秒） */
export const SMOKE = {
  count: 96, // 每根烟囱的粒子数
  lifeMin: 9, // 单颗粒子存活时长下限
  lifeMax: 14, // 存活时长上限
  riseHeight: 62, // 上升总高度（指数逼近，永远差一点点到顶）
  riseTau: 4.2, // 上升时间常数：越小越快接近最高点
  sizeStart: 4.5, // 出口处的烟团直径
  sizeEnd: 22, // 消散时的烟团直径
  opacity: 0.34, // 单颗粒子峰值不透明度
  turbulence: 2.8, // 横向湍流摆幅
  spread: 0.55, // 出生点相对烟囱半径的散布比例
  windGain: 1.15, // 每级风带来的横向推移速度（m/s）
  windRamp: 0.6, // 越高受风越强（0 = 全程一致，1 = 完全线性增强）
  spin: 0.5, // 烟团自转速度上限（rad/s）
  // 风向（世界 xz 平面，单位向量）：朝城市一侧吹，远景里能看清烟被拉长
  windDir: [-0.88, 0.47],
  color: '#e9edf2'
}

/** 烟团贴图：几团半径不同的柔边圆叠出不规则轮廓，比单个圆点更像烟 */
export function makePuffTexture(size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  const blobs = [
    { x: 0.5, y: 0.5, r: 0.5, a: 0.6 },
    { x: 0.4, y: 0.44, r: 0.34, a: 0.5 },
    { x: 0.61, y: 0.52, r: 0.32, a: 0.46 },
    { x: 0.52, y: 0.63, r: 0.3, a: 0.42 },
    { x: 0.43, y: 0.61, r: 0.26, a: 0.34 },
    { x: 0.59, y: 0.39, r: 0.24, a: 0.3 }
  ]
  for (const b of blobs) {
    const cx = b.x * size
    const cy = b.y * size
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r * size)
    g.addColorStop(0, `rgba(255,255,255,${b.a})`)
    g.addColorStop(0.45, `rgba(255,255,255,${b.a * 0.5})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * 建一份烟羽的粒子状态。
 * 出生时间在整个生命周期里随机打散，所以第一帧就是一根完整的烟柱。
 */
export function createPlume(count = SMOKE.count) {
  const p = {
    count,
    age: new Float32Array(count),
    life: new Float32Array(count),
    seed: new Float32Array(count * 3), // [出生点 x, 出生点 z, 随机相位]
    spin: new Float32Array(count)
  }
  // 出生时间在整个寿命区间里随机撒开：第一帧就是一根完整的烟柱
  for (let i = 0; i < count; i++) respawn(p, i, Math.random() * SMOKE.lifeMax)
  return p
}

function respawn(p, i, initialAge = 0) {
  p.age[i] = initialAge
  p.life[i] = SMOKE.lifeMin + Math.random() * (SMOKE.lifeMax - SMOKE.lifeMin)

  // 出生点：烟囱口内的随机圆盘（sqrt 保证在圆内均匀分布）
  const a = Math.random() * Math.PI * 2
  const r = Math.sqrt(Math.random())
  p.seed[i * 3] = Math.cos(a) * r
  p.seed[i * 3 + 1] = Math.sin(a) * r
  p.seed[i * 3 + 2] = Math.random()

  p.spin[i] = (Math.random() - 0.5) * 2 * SMOKE.spin
}

/**
 * 推进一帧，把结果写进 out（out 里就是绑到几何体上的那几个数组）。
 *
 * @param {object} p        createPlume 的返回值
 * @param {number} dt       帧间隔（秒）
 * @param {object} out      { position, size, alpha, rot }
 * @param {object} mouth    烟囱口 { x, y, z, radius }
 * @param {number} windX    风在世界 x 上的推移速度（m/s）
 * @param {number} windZ    风在世界 z 上的推移速度（m/s）
 */
export function updatePlume(p, dt, out, mouth, windX, windZ) {
  const { age, life, seed, spin } = p
  const { position, size, alpha, rot } = out
  const { x: ox, y: oy, z: oz, radius } = mouth

  for (let i = 0; i < p.count; i++) {
    age[i] += dt
    if (age[i] >= life[i]) respawn(p, i, age[i] - life[i])

    const a = age[i]
    const t = a / life[i] // 归一化年龄 0 → 1

    // 上升：起步快、越往上越慢
    const rise = 1 - Math.exp(-a / SMOKE.riseTau)
    // 扩散：越高摊得越开
    const spread = radius * SMOKE.spread * (0.35 + 1.65 * t)
    // 湍流：两路不同频率的摆动，只在中后段明显
    const turb = SMOKE.turbulence * t
    const ph = seed[i * 3 + 2]
    const sx = Math.sin(a * 0.62 + ph * 6.283)
    const sz = Math.cos(a * 0.47 + ph * 4.1)
    // 越高的烟越吃风
    const wRamp = 1 + SMOKE.windRamp * t

    position[i * 3] = ox + seed[i * 3] * spread + sx * turb + windX * a * wRamp
    position[i * 3 + 1] = oy + SMOKE.riseHeight * rise + sz * turb * 0.35
    position[i * 3 + 2] = oz + seed[i * 3 + 1] * spread + sz * turb + windZ * a * wRamp

    size[i] = SMOKE.sizeStart + (SMOKE.sizeEnd - SMOKE.sizeStart) * t
    // 出口处快速淡入，之后整段缓慢淡出
    alpha[i] = SMOKE.opacity * Math.min(t / 0.1, 1) * Math.pow(1 - t, 1.6)

    // 自转：同一个贴图在多颗粒子间转出差异。取模避免长时间运行后浮点精度掉到看得出来
    rot[i] = (rot[i] + spin[i] * dt) % 6.283185307179586
  }
}
