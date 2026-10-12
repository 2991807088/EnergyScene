import { useState } from 'react'
import Scene from '@/components/Scene'
import ControlPanel from '@/components/ControlPanel'
import './App.less'

export default function App() {
  const [timeOfDay, setTimeOfDay] = useState('day')
  const [weather, setWeather] = useState('clear')
  const [wind, setWind] = useState(2)

  return (
    <div className="app">
      <main className="app__body">
        <Scene mode={timeOfDay} weather={weather} wind={wind} />
        <ControlPanel
          timeOfDay={timeOfDay}
          onTimeOfDayChange={setTimeOfDay}
          weather={weather}
          onWeatherChange={setWeather}
          wind={wind}
          onWindChange={setWind}
        />
      </main>
    </div>
  )
}
