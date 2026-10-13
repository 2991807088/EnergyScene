import { GROUND_SIZE } from './cityLayout'

// ============================================================
//  环境预设：白天 / 黑夜
//  切换时由 Scene 里的 DayNightRig 做平滑插值过渡
// ============================================================

// 太阳方向（单位向量）。
// 仰角 16.5°：既要「看得见」，又要「高于远处的山脊」——
// 默认相机俯角约 1.5°、垂直半视角 22.5°，所以太阳仰角不能超过约 21°，
// 否则会跑出画面（历史上就踩过「看不到太阳」的坑）。
// 视觉太阳（Sun 组件）与主光（directionalLight）必须共用这一份，否则影子方向对不上。
export const SUN_DIRECTION = [-0.61384, 0.28402, -0.73657]

export const ENVIRONMENTS = {
  day: {
    key: 'day',
    label: '白天',
    // 天空 / 雾
    background: '#a7c0de',
    // 雾：颜色 = 天空盒地平线色（远处地形会自然融进天际线，而不是被洗白）；
    // near 推得很远，保证城区和山脊清晰，只有最远端才有一点点大气感。
    // 城区放大到 200×200 后，雾距同比例外推，否则城区会被雾洗淡。
    fog: { color: '#cfe2f5', near: GROUND_SIZE * 1.4, far: GROUND_SIZE * 3.5 },
    // 天空盒调色板（6 面立方体贴图，由 three/skybox.js 绘制）
    sky: {
      zenith: '#2f6ec9',
      horizon: '#cfe2f5',
      below: '#a8b5c2',
      haze: 0.1,
      sunColor: '#fff7e2',
      glowColor: '#ffd08a',
      glow: 0.45,
      disc: 1,
      discAngle: 0.029,
      crescent: 0, // 白天是完整的太阳圆面
      cloudColor: '#ffffff',
      cloudShade: '#b9cbe0',
      cloudCover: 0.34,
      cloudAmount: 0.8,
      // 云层在「云平面」上的投影尺度。太小会让一朵云横跨大半片天（像一块糊上去的白布），
      // 3.2 对应云顶附近约 20° 一朵，接近真实积云。
      cloudScale: 3.2,
      stars: 0
    },
    // 灯光
    ambient: { intensity: 0.7, color: '#ffffff' },
    hemisphere: { sky: '#cfe2ff', ground: '#707a86', intensity: 0.85 },
    key: { intensity: 2.6, color: '#fff2da' }, // 主光（太阳）
    rim: { intensity: 10, color: '#ffcf8a' },  // 补光
    // 环境贴图强度
    envIntensity: 1.15,
    // 地面（反射 / 粗糙度）
    ground: { roughness: 0.86, metalness: 0.04, mirror: 0.08 }
  },
  night: {
    key: 'night',
    label: '黑夜',
    background: '#0a0d13',
    fog: { color: '#17273c', near: GROUND_SIZE * 1.1, far: GROUND_SIZE * 3 },
    sky: {
      zenith: '#04070e',
      horizon: '#17273c',
      below: '#0a1017',
      haze: 0.09,
      // 夜里用「月亮」占同一个方向：与主光（directionalLight）方向一致，
      // 才不会出现「光照从这边来、亮斑在那边」的错位。
      sunColor: '#eef4ff',
      glowColor: '#8fb2d8',
      glow: 0.2,
      disc: 0.95,
      discAngle: 0.024,
      // 弯月：>0 时把月盘削成月牙，数值 = 暗盘平移量 / 月盘半径。
      // 0.7 对应月牙最宽处约月盘直径的 35%，是「一轮弯月」而不是「细钩」或「缺口的圆」。
      crescent: 0.7,
      cloudColor: '#3d4c64',
      cloudShade: '#1c2534',
      cloudCover: 0.34,
      cloudAmount: 0.85,
      cloudScale: 2.8,
      stars: 0.004
    },
    ambient: { intensity: 0.32, color: '#aab8d0' },
    hemisphere: { sky: '#aec6e8', ground: '#0a0d13', intensity: 0.35 },
    key: { intensity: 1.7, color: '#dfe8ff' },
    rim: { intensity: 34, color: '#22d3ee' },
    envIntensity: 0.6,
    ground: { roughness: 0.9, metalness: 0.05, mirror: 0.08 }
  }
}

export const TIME_OPTIONS = [
  { key: 'day', label: '白天' },
  { key: 'night', label: '黑夜' }
]

// 风力档位（0~10），用于把数值翻译成人话
export const WIND_LEVELS = [
  { max: 0.5, label: '无风' },
  { max: 3, label: '微风' },
  { max: 6, label: '中风' },
  { max: 8.5, label: '大风' },
  { max: Infinity, label: '狂风' }
]

export function getWindLabel(wind) {
  const v = Number(wind) || 0
  return WIND_LEVELS.find((l) => v <= l.max)?.label ?? '狂风'
}

// ---- 风力 → 风机转速 ----
export const WIND_MAX = 10
export const TURBINE_CUT_IN = 1.2 // 切入风速：低于此值风不够，风机停转（真实风机也是这样）
export const TURBINE_RATED_SPIN = 2.2 // 风力拉满时的角速度 rad/s ≈ 21 转/分

/**
 * 风力档位 → 风机转子角速度（rad/s）。
 * 用 0.6 次幂而不是线性：线性会让滑块中低段慢到看不出来（风 2 时只有满速的 9%）。
 * 无风/微风直接归零，是判断「到底有没有联动」最直观的信号。
 */
export function getTurbineSpin(wind) {
  const v = Math.max(0, Math.min(WIND_MAX, Number(wind) || 0))
  if (v <= TURBINE_CUT_IN) return 0
  const t = (v - TURBINE_CUT_IN) / (WIND_MAX - TURBINE_CUT_IN)
  return TURBINE_RATED_SPIN * Math.pow(t, 0.6)
}
