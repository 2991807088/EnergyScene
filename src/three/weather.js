import * as THREE from 'three'
import { ENVIRONMENTS } from './environments'
import { makeSkyPalette, lerpSkyPalette } from './skybox'

// ============================================================
//  天气预设：晴 / 雨 / 雪 / 雾
//  只描述「相对昼夜基准」的修正量，最终由 mergeEnvironment 合并
// ============================================================
export const WEATHERS = {
  clear: {
    key: 'clear',
    label: '晴天',
    sky: { color: '#000000', mix: 0 },
    fog: { near: Infinity, far: Infinity, color: '#000000', mix: 0 },
    light: { ambient: 1, key: 1, hemisphere: 1, rim: 1 },
    ground: { mirror: 0, roughness: 0 },
    // 晴天不改天空盒，直接用昼夜本身的调色板
    skyboxMix: 0,
    skybox: {}
  },
  rain: {
    key: 'rain',
    label: '下雨',
    sky: { color: '#2b333d', mix: 0.62 },
    fog: { near: 15, far: 38, color: '#39424d', mix: 0.55 },
    light: { ambient: 1.2, key: 0.42, hemisphere: 0.95, rim: 0.7 },
    // 雨天路面湿滑：反射更强、更光滑
    ground: { mirror: 0.2, roughness: -0.14 },
    skyboxMix: 0.82,
    skybox: {
      zenith: '#2c3540',
      horizon: '#6b7885',
      below: '#4d555f',
      haze: 0.16,
      sunColor: '#b9c3cd',
      glowColor: '#7d8894',
      glow: 0.08,
      disc: 0.12,
      cloudColor: '#7d8894',
      cloudShade: '#454e58',
      cloudCover: 0.9,
      cloudAmount: 1,
      cloudScale: 2.6,
      stars: 0
    }
  },
  snow: {
    key: 'snow',
    label: '下雪',
    sky: { color: '#c3ccd6', mix: 0.6 },
    fog: { near: 12, far: 34, color: '#c9d2da', mix: 0.6 },
    light: { ambient: 1.35, key: 0.55, hemisphere: 1.1, rim: 0.7 },
    // 雪地偏粗糙、反光弱
    ground: { mirror: -0.14, roughness: 0.1 },
    skyboxMix: 0.85,
    skybox: {
      zenith: '#8b98a8',
      horizon: '#dde4ec',
      below: '#aab3bd',
      haze: 0.14,
      sunColor: '#ffffff',
      glowColor: '#dfe8f2',
      glow: 0.16,
      disc: 0.22,
      cloudColor: '#eef3f8',
      cloudShade: '#a9b5c2',
      cloudCover: 0.92,
      cloudAmount: 1,
      cloudScale: 2.8,
      stars: 0
    }
  },
  fog: {
    key: 'fog',
    label: '大雾',
    sky: { color: '#9aa3ac', mix: 0.72 },
    fog: { near: 5, far: 24, color: '#a7afb8', mix: 0.78 },
    light: { ambient: 1.3, key: 0.35, hemisphere: 1.0, rim: 0.5 },
    ground: { mirror: -0.1, roughness: 0.12 },
    skyboxMix: 0.88,
    skybox: {
      zenith: '#98a1aa',
      horizon: '#c6ccd2',
      below: '#a3aab1',
      haze: 0.2,
      sunColor: '#d8dde3',
      glowColor: '#b6bdc4',
      glow: 0.06,
      disc: 0.08,
      cloudColor: '#c2c8ce',
      cloudShade: '#9aa1a8',
      cloudCover: 0.7,
      cloudAmount: 0.7,
      cloudScale: 2.4,
      stars: 0
    }
  }
}

export const WEATHER_OPTIONS = Object.values(WEATHERS)

const _a = new THREE.Color()
const _b = new THREE.Color()
const clamp01 = (v) => Math.max(0, Math.min(1, v))

function mixColor(baseHex, overHex, t) {
  _a.set(baseHex)
  _b.set(overHex)
  return `#${_a.lerp(_b, t).getHexString()}`
}

/**
 * 把「昼夜环境」与「天气」合并成一份最终环境配置。
 * 天气对天空色、雾、光照强度、地面质感做修正。
 */
export function mergeEnvironment(mode, weatherKey) {
  const base = ENVIRONMENTS[mode] ?? ENVIRONMENTS.night
  const w = WEATHERS[weatherKey] ?? WEATHERS.clear

  // 天空盒：先把天气的覆盖项盖在昼夜基准上（保证 15 个字段一个不缺），
  // 再按 skyboxMix 插值——这样晴天 = 纯昼夜调色板，雨雪雾 = 大部分听天气的，
  // 但仍保留一点昼夜差异（夜里的雨天不会和白天一模一样）。
  const baseSky = makeSkyPalette(base.sky)
  const skyMix = w.skyboxMix ?? 0
  const sky =
    skyMix > 0
      ? lerpSkyPalette(baseSky, makeSkyPalette({ ...base.sky, ...w.skybox }), skyMix)
      : baseSky

  return {
    key: `${mode}-${w.key}`,
    background: mixColor(base.background, w.sky.color, w.sky.mix),
    sky,
    fog: {
      color: mixColor(base.fog.color, w.fog.color, w.fog.mix),
      near: Math.min(base.fog.near, w.fog.near),
      far: Math.min(base.fog.far, w.fog.far)
    },
    ambient: {
      intensity: base.ambient.intensity * w.light.ambient,
      color: base.ambient.color
    },
    hemisphere: {
      ...base.hemisphere,
      intensity: base.hemisphere.intensity * w.light.hemisphere
    },
    key: { ...base.key, intensity: base.key.intensity * w.light.key },
    rim: { ...base.rim, intensity: base.rim.intensity * w.light.rim },
    envIntensity: base.envIntensity,
    ground: {
      roughness: clamp01(base.ground.roughness + w.ground.roughness),
      metalness: base.ground.metalness,
      mirror: clamp01(base.ground.mirror + w.ground.mirror)
    }
  }
}
