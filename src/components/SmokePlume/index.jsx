import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SMOKE, createPlume, makePuffTexture, updatePlume } from '@/three/smoke'

// 逐粒子的尺寸 / 透明度 / 自转角，以及把世界尺寸换算成像素，
// 都是 PointsMaterial 做不到的，所以这里自己写一版着色器。
// fog / 色调映射 / 色彩空间沿用 three 的 chunk，保证和场景里其他材质一致。
const VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>

  attribute float aSize;
  attribute float aAlpha;
  attribute float aRot;

  uniform float uScale;

  varying float vAlpha;
  varying float vRot;

  void main() {
    vAlpha = aAlpha;
    vRot = aRot;

    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    // uScale 已含画布物理高度与相机 fov，aSize 直接就是世界单位下的直径
    gl_PointSize = aSize * uScale / max( -mvPosition.z, 0.001 );
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>

  uniform sampler2D uMap;
  uniform vec3 uColor;

  varying float vAlpha;
  varying float vRot;

  void main() {
    // 绕贴图中心自转，免得几十颗粒子共用同一张图时看出重复
    vec2 uv = gl_PointCoord - 0.5;
    float s = sin( vRot );
    float c = cos( vRot );
    uv = vec2( uv.x * c - uv.y * s, uv.x * s + uv.y * c ) + 0.5;

    float alpha = texture2D( uMap, uv ).a * vAlpha;
    if ( alpha < 0.01 ) discard;

    gl_FragColor = vec4( uColor, alpha );

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

// 所有烟囱共用一张贴图，省一份显存
let _puff = null
function puffTexture() {
  if (!_puff) _puff = makePuffTexture()
  return _puff
}

/** 单根烟囱的烟 */
function Plume({ mouth, wind = 0 }) {
  const geomRef = useRef()
  const matRef = useRef()

  const data = useMemo(() => {
    const n = SMOKE.count
    return {
      plume: createPlume(n),
      position: new Float32Array(n * 3),
      size: new Float32Array(n),
      alpha: new Float32Array(n),
      rot: new Float32Array(n)
    }
  }, [])

  const uniforms = useMemo(
    () => ({
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uMap: { value: puffTexture() },
      uColor: { value: new THREE.Color(SMOKE.color) },
      uScale: { value: 600 }
    }),
    []
  )

  // args 必须是稳定引用，否则 r3f 每次渲染都会重建材质
  const matProps = useMemo(
    () => ({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      fog: true
    }),
    [uniforms]
  )

  useFrame((state, delta) => {
    const geo = geomRef.current
    const mat = matRef.current
    if (!geo || !mat) return

    const dt = Math.min(delta, 0.05)
    updatePlume(
      data.plume,
      dt,
      data,
      mouth,
      SMOKE.windDir[0] * wind * SMOKE.windGain,
      SMOKE.windDir[1] * wind * SMOKE.windGain
    )

    geo.attributes.position.needsUpdate = true
    geo.attributes.aSize.needsUpdate = true
    geo.attributes.aAlpha.needsUpdate = true
    geo.attributes.aRot.needsUpdate = true

    // 世界单位 → 像素：透视投影下 1 世界单位在距离 d 处占 h / (2·tan(fov/2)) / d 像素
    const cam = state.camera
    const fov = cam.isPerspectiveCamera ? cam.fov : 45
    const h = state.size.height * state.viewport.dpr
    mat.uniforms.uScale.value = h / (2 * Math.tan((fov * Math.PI) / 360))
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[data.position, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[data.size, 1]} />
        <bufferAttribute attach="attributes-aAlpha" args={[data.alpha, 1]} />
        <bufferAttribute attach="attributes-aRot" args={[data.rot, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={matRef} args={[matProps]} />
    </points>
  )
}

/**
 * 烟囱烟羽。
 * @param {Array<{x:number,y:number,z:number,radius:number}>} mouths 烟囱口（世界坐标）
 * @param {number} wind 风力等级，越大烟被吹得越平
 */
export default function SmokePlume({ mouths = [], wind = 0 }) {
  return (
    <group>
      {mouths.map((m, i) => (
        <Plume key={i} mouth={m} wind={wind} />
      ))}
    </group>
  )
}
