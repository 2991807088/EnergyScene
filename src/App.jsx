import { useState } from 'react'
import Scene from '@/components/Scene'
import ControlPanel from '@/components/ControlPanel'
import { CAMERA_VIEWS } from '@/three/cameraViews'
import './App.less'

export default function App() {
  const [cameraView, setCameraView] = useState(CAMERA_VIEWS[0])
  const [timeOfDay, setTimeOfDay] = useState('day')
  const [weather, setWeather] = useState('clear')
  const [wind, setWind] = useState(2)
  const [buildingLight, setBuildingLight] = useState(1)
  const [turbineCount, setTurbineCount] = useState(48)
  const [thermalGenerating, setThermalGenerating] = useState(true)
  const [hydroGenerating, setHydroGenerating] = useState(true)

  return (
    <div className="app">
      <main className="app__body">
        <Scene
          cameraView={cameraView}
          mode={timeOfDay}
          weather={weather}
          wind={wind}
          buildingLight={buildingLight}
          turbineCount={turbineCount}
          thermalGenerating={thermalGenerating}
          hydroGenerating={hydroGenerating}
        />
        <ControlPanel
          cameraView={cameraView}
          onCameraViewChange={(view) => setCameraView({ ...view })}
          timeOfDay={timeOfDay}
          onTimeOfDayChange={setTimeOfDay}
          weather={weather}
          onWeatherChange={setWeather}
          wind={wind}
          onWindChange={setWind}
          buildingLight={buildingLight}
          onBuildingLightChange={setBuildingLight}
          turbineCount={turbineCount}
          onTurbineCountChange={setTurbineCount}
          thermalGenerating={thermalGenerating}
          onThermalGeneratingChange={setThermalGenerating}
          hydroGenerating={hydroGenerating}
          onHydroGeneratingChange={setHydroGenerating}
        />
      </main>
    </div>
  )
}
