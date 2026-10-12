import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  SKY_FACE_SIZE,
  createSkybox,
  paintSkybox,
  lerpSkyPalette
} from '@/three/skybox'

// 昼夜/天气切换时天空的过渡时长（秒）与重绘间隔（秒）。
// 天空是 6 张 canvas 逐像素画的，一次全重绘约 26ms，不能每帧画；
// 按 0.13s 一帧重绘，0.9s 内约 7 帧，肉眼看是连续渐变。
const TRANSITION = 0.9
const REPAINT_INTERVAL = 0.13

/**
 * 天空盒：6 张程序化 canvas 组成的 CubeTexture，作为场景背景与环境贴图。
 *
 * 为什么不用 drei 的 <Environment> + Lightformer：
 * 那几个假光源照出来的反射和真实天空对不上（比如玻璃幕墙反射出一块方形亮斑）。
 * 现在直接把天空盒当环境贴图，反射的就是天上的太阳和云。
 */
export default function Sky({ palette, envIntensity = 1 }) {
  const { scene, gl } = useThree()

  const texture = useMemo(() => createSkybox(SKY_FACE_SIZE), [])
  const pmrem = useMemo(() => new THREE.PMREMGenerator(gl), [gl])

  const to = useRef(palette) // 目标调色板
  const from = useRef(palette) // 本段过渡的起点
  const shown = useRef(null) // 当前实际画在贴图上的调色板
  const t0 = useRef(-1) // 本段过渡的起始时刻
  const last = useRef(-1) // 上次重绘时刻
  const settled = useRef(true)
  const envRT = useRef(null)
  const envI = useRef(envIntensity)

  // 生成 / 更新环境贴图（PMREM），供玻璃、地面做反射。
  // 只在「稳定下来」时做一次：过渡途中每帧重建 PMREM 太浪费，
  // 而且反射的色相变化人眼几乎看不出来。
  const refreshEnv = () => {
    const rt = pmrem.fromCubemap(texture)
    scene.environment = rt.texture
    scene.environmentIntensity = envI.current
    if (envRT.current) envRT.current.dispose()
    envRT.current = rt
  }

  // 挂载：先画好再交给场景，避免第一帧出现黑底
  useLayoutEffect(() => {
    const prevBackground = scene.background
    const prevEnvironment = scene.environment
    paintSkybox(texture, palette)
    shown.current = palette
    scene.background = texture
    refreshEnv()

    return () => {
      // 注意：不要把 texture 本身 dispose 掉——StrictMode 下 effect 会跑两遍，
      // 第二次还要用同一张贴图。
      scene.background = prevBackground
      scene.environment = prevEnvironment
      if (envRT.current) {
        envRT.current.dispose()
        envRT.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, texture])

  // 调色板变化 → 以「当前画出来的样子」为起点重新起一段过渡
  useEffect(() => {
    if (to.current === palette) return // 挂载时跳过（上面已经画过）
    from.current = shown.current ?? palette
    to.current = palette
    t0.current = -1
    settled.current = false
  }, [palette])

  useFrame((state, dt) => {
    // 环境光强度也跟着预设平滑走
    const k = 1 - Math.exp(-6 * dt)
    envI.current += (envIntensity - envI.current) * k
    if (scene.environmentIntensity !== undefined) {
      scene.environmentIntensity = envI.current
    }

    const now = state.clock.elapsedTime
    if (t0.current < 0) t0.current = now
    const t = Math.min(1, (now - t0.current) / TRANSITION)

    if (t >= 1) {
      if (!settled.current) {
        // 收尾必须用目标调色板原值画一次，保证终点和预设完全一致
        paintSkybox(texture, to.current)
        shown.current = to.current
        settled.current = true
        refreshEnv()
      }
      return
    }

    if (now - last.current < REPAINT_INTERVAL) return
    last.current = now
    const mid = lerpSkyPalette(from.current, to.current, t)
    paintSkybox(texture, mid)
    shown.current = mid
  })

  return null
}
