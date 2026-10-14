import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from '@react-three/drei'
import Sky from '@/components/Sky'
import CityGround from '@/components/CityGround'
import Terrain from '@/components/Terrain'
import WindTurbines from '@/components/WindTurbines'
import SolarFarm from '@/components/SolarFarm'
import Forest from '@/components/Forest'
import Buildings from '@/components/Buildings'
import PlannedFacilities from '@/components/PlannedFacilities'
import ChargingStation from '@/components/ChargingStation'
import Pond from '@/components/Pond'
import River from '@/components/River'
import TrafficLights from '@/components/TrafficLights'
import Cars from '@/components/Cars'
import Weather from '@/components/Weather'
import Sun from '@/components/Sun'
import { mergeEnvironment } from '@/three/weather'
import { SUN_DIRECTION } from '@/three/environments'
import './index.less'

const _c = new THREE.Color()
const FOG_TARGET = new THREE.Vector3(0, 3.2, 0)
const FOG_REFERENCE_DISTANCE = 20
const lerp = (a, b, t) => a + (b - a) * t
// 主光位置由 SUN_DIRECTION 推出（只有方向有意义），与视觉太阳保持一致
const KEY_LIGHT_POS = new THREE.Vector3(...SUN_DIRECTION).normalize().multiplyScalar(20)

/**
 * 昼夜环境切换的核心：每帧把天空色、雾、各灯光向目标预设平滑插值。
 * 好处是「白天 <-> 黑夜」不是硬切，而是渐变过渡。
 */
function DayNightRig({ preset, weather }) {
  const ambient = useRef()
  const hemi = useRef()
  const key = useRef()
  const rim = useRef()
  const { scene, camera, controls } = useThree()

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-6 * dt) // 平滑系数（时间常数约 0.17s）

    // 天空背景：正常由 <Sky> 接管（立方体贴图）。
    // 这里是兜底——只有当背景仍是纯色时才插值。
    if (scene.background && scene.background.isColor) {
      scene.background.lerp(_c.set(preset.background), k)
    }

    // 雾
    if (scene.fog) {
      const cameraDistance = camera.position.distanceTo(controls?.target ?? FOG_TARGET)
      const fogScale = weather === 'clear' ? 1 : Math.max(1, cameraDistance / FOG_REFERENCE_DISTANCE)
      scene.fog.color.lerp(_c.set(preset.fog.color), k)
      scene.fog.near = lerp(scene.fog.near, preset.fog.near * fogScale, k)
      scene.fog.far = Math.max(
        lerp(scene.fog.far, preset.fog.far * fogScale, k),
        cameraDistance * 1.5
      )
    }

    // 环境光
    if (ambient.current) {
      ambient.current.intensity = lerp(ambient.current.intensity, preset.ambient.intensity, k)
      ambient.current.color.lerp(_c.set(preset.ambient.color), k)
    }

    // 半球光
    if (hemi.current) {
      hemi.current.intensity = lerp(hemi.current.intensity, preset.hemisphere.intensity, k)
      hemi.current.color.lerp(_c.set(preset.hemisphere.sky), k)
      hemi.current.groundColor.lerp(_c.set(preset.hemisphere.ground), k)
    }

    // 主光（太阳 / 月光）
    if (key.current) {
      key.current.intensity = lerp(key.current.intensity, preset.key.intensity, k)
      key.current.color.lerp(_c.set(preset.key.color), k)
    }

    // 补光
    if (rim.current) {
      rim.current.intensity = lerp(rim.current.intensity, preset.rim.intensity, k)
      rim.current.color.lerp(_c.set(preset.rim.color), k)
    }
  })

  return (
    <>
      <ambientLight ref={ambient} intensity={0.32} color="#aab8d0" />
      <hemisphereLight ref={hemi} args={['#aec6e8', '#0a0d13', 0.35]} />
      <directionalLight
        ref={key}
        position={[KEY_LIGHT_POS.x, KEY_LIGHT_POS.y, KEY_LIGHT_POS.z]}
        intensity={1.7}
        color="#dfe8ff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      />
      <pointLight
        ref={rim}
        position={[-7, 4, -7]}
        intensity={34}
        color="#22d3ee"
      />
    </>
  )
}

/** 临时取景探针：?cam=x,y,z&target=x,y,z（校验用，验证完删除） */
function CamProbe() {
  const { camera, controls } = useThree()
  useEffect(() => {
    console.log('[CamProbe] mounted, cam=', camera.position.toArray().map((v) => +v.toFixed(1)))
    let tries = 0
    const apply = () => {
      const q = new URLSearchParams(window.location.search)
      const cam = q.get('cam')
      const tgt = q.get('target')
      if (cam) camera.position.set(...cam.split(',').map(Number))
      if (tgt && controls) {
        controls.target.set(...tgt.split(',').map(Number))
        controls.update()
        return true
      }
      return false
    }
    // makeDefault 的 controls 可能晚于本 effect 就绪，重试直到设置成功
    const timer = setInterval(() => {
      const done = apply() || ++tries > 20
      if (done) {
        clearInterval(timer)
        console.log(
          '[CamProbe] final cam=',
          camera.position.toArray().map((v) => +v.toFixed(1)),
          'target=',
          controls?.target.toArray().map((v) => +v.toFixed(1)),
          'search=',
          window.location.search
        )
        let ticks = 0
        const monitor = setInterval(() => {
          console.log(
            '[CamProbe] t+' + ++ticks + 's cam=',
            camera.position.toArray().map((v) => +v.toFixed(1)),
            'target=',
            controls?.target.toArray().map((v) => +v.toFixed(1)),
            'fov=',
            camera.fov
          )
          if (ticks >= 4) clearInterval(monitor)
        }, 2000)
      }
    }, 250)
    return () => clearInterval(timer)
  }, [camera, controls])
  return null
}

export default function Scene({ mode = 'night', weather = 'clear', wind = 0, buildingLight = 1, turbineCount = 48, thermalGenerating = true, hydroGenerating = true }) {
  const preset = useMemo(() => mergeEnvironment(mode, weather), [mode, weather])

  return (
    <div className="scene">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [500, 350, 450], fov: 45, near: 0.5, far: 1400 }}
      >
        <color attach="background" args={['#0a0d13']} />
        {/* 雾的初值：挂载后立刻由 DayNightRig 拉到预设值，所以给个「远」的初值，
            避免加载瞬间先糊一层雾再散开 */}
        <fog attach="fog" args={['#cfe2f5', 240, 700]} />

        <DayNightRig preset={preset} weather={weather} />

        {/* 天空盒：同时作为背景与环境贴图（反射用），替代原来的假光源环境 */}
        <Sky palette={preset.sky} envIntensity={preset.envIntensity} />

        <Sun visible={mode === 'day' && weather === 'clear'} />

        <Terrain />

        <WindTurbines wind={wind} count={turbineCount} />

        <SolarFarm />

        <Forest wind={wind} />

        <Buildings lightLevel={buildingLight} />

        <PlannedFacilities wind={wind} thermalGenerating={thermalGenerating} hydroGenerating={hydroGenerating} />

        <ChargingStation />


        <TrafficLights />

        <Cars />

        <Weather weather={weather} wind={wind} />

        <CityGround appearance={preset.ground} />

        <Pond />

        <River />

        <OrbitControls
          makeDefault
          target={[100, 0, 0]}
          enableDamping
          dampingFactor={0.08}
          minDistance={3}
          maxDistance={900}
          maxPolarAngle={Math.PI / 2 - 0.02}
        />

        <CamProbe />
      </Canvas>
    </div>
  )
}
