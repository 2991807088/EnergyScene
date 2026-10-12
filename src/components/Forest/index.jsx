import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { buildForest, createForestAnimator, TREE_SPECIES } from '@/three/trees'
import { bakeTreeModel, treeModelUrl } from '@/three/treeModels'

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

// 树种是模块级常量，URL 顺序即 TREE_SPECIES 顺序
const MODEL_URLS = TREE_SPECIES.map((sp) => treeModelUrl(sp.key))

/**
 * 加载 5 个树种模型并烘成实例批次。
 *
 * 一次调 useGLTF 传入 URL 数组比循环调用更安全（循环里调 hook 违反 hooks 规则），
 * 而且 useLoader 内部按 URL 做深度比较，数组引用是稳定的 → useMemo 只跑一次。
 */
function useTreeModels() {
  const gltfs = useGLTF(MODEL_URLS)
  return useMemo(() => {
    const models = {}
    TREE_SPECIES.forEach((sp, i) => {
      models[sp.key] = bakeTreeModel(gltfs[i].scene)
    })
    return models
  }, [gltfs])
}

function ForestInner({ wind = 0 }) {
  const models = useTreeModels()
  const { trees, batches } = useMemo(() => buildForest(models), [models])
  const meshRefs = useRef([])
  const animator = useMemo(() => createForestAnimator(trees, batches), [trees, batches])

  // 实例色：把每棵树的色调写进 instanceColor，省掉「一树一材质」
  // 用 useLayoutEffect 是为了赶在第一帧渲染前写入，否则材质会多编译一次
  useLayoutEffect(() => {
    const color = new THREE.Color()
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      batch.mesh = mesh // 交给 animator 逐帧写矩阵
      for (let k = 0; k < batch.count; k++) {
        const [r, g, b] = batch.tint[k]
        color.setRGB(r, g, b)
        mesh.setColorAt(k, color)
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }, [batches])

  useFrame((state, delta) => {
    animator(state.clock.elapsedTime, clamp01(wind / 10), delta)
  })

  return (
    <group>
      {batches.map((batch, i) => (
        <instancedMesh
          key={batch.key}
          ref={(el) => {
            meshRefs.current[i] = el
          }}
          args={[batch.geometry, batch.material, batch.count]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  )
}

/**
 * 树林：5 个树种（针叶树 / 阔叶树 / 钻天杨 / 圆冠树 / 灌木）。
 * 几何来自真实模型（Kenney Nature Kit，CC0），见 three/treeModels.js。
 * - 城市中心是规则树阵，城市周边是成团撒下的林带（落在真实地形高度上）
 * - 全部走 InstancedMesh：每个「树种 + 部件」一个批次，几百棵树只要十几次 draw call
 * - 摆动：枝干层跟随、树冠层明显摆，全场摆动方向一致（像同一阵风）
 *
 * 模型是静态资源、走 Suspense，所以这里自带一层 <Suspense>，
 * 加载期间只挂起树林本身，不会拖住整棵树以外的场景。
 */
export default function Forest({ wind = 0 }) {
  return (
    <Suspense fallback={null}>
      <ForestInner wind={wind} />
    </Suspense>
  )
}

// 提前发起 5 个模型的加载（总共约 64 KB）
useGLTF.preload(MODEL_URLS)
