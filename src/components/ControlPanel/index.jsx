import { useState } from 'react'
import { TIME_OPTIONS, getWindLabel } from '@/three/environments'
import { WEATHER_OPTIONS } from '@/three/weather'
import './index.less'

export default function ControlPanel({
  timeOfDay,
  onTimeOfDayChange,
  weather,
  onWeatherChange,
  wind,
  onWindChange,
  buildingLight,
  onBuildingLightChange,
  turbineCount,
  onTurbineCountChange
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`panel ${collapsed ? 'is-collapsed' : ''}`}>
      {/* 固定宽度的内层：折叠时被外层 overflow 裁掉，内容不会边收边重排 */}
      {/* inert 让收起后的按钮退出 Tab 顺序，不然键盘还能 Tab 进看不见的控件 */}
      <div className="panel__inner" inert={collapsed}>
        <section className="panel__section">
          <h3 className="panel__label">环境</h3>
          <div className="panel__shapes">
            {TIME_OPTIONS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`panel__shape-btn ${timeOfDay === t.key ? 'is-active' : ''}`}
                onClick={() => onTimeOfDayChange(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel__section">
          <h3 className="panel__label">天气</h3>
          <div className="panel__shapes">
            {WEATHER_OPTIONS.map((w) => (
              <button
                key={w.key}
                type="button"
                className={`panel__shape-btn ${weather === w.key ? 'is-active' : ''}`}
                onClick={() => onWeatherChange(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel__section">
          <h3 className="panel__label">风力</h3>
          <input
            className="panel__slider"
            type="range"
            aria-label="风力等级"
            min="0"
            max="10"
            step="0.1"
            value={wind}
            onChange={(e) => onWindChange(Number(e.target.value))}
          />
          <div className="panel__slider-value">
            <span>{(wind ?? 0).toFixed(1)} 级</span>
            <span>{getWindLabel(wind)}</span>
          </div>
        </section>

        <section className="panel__section">
          <h3 className="panel__label">风机数量</h3>
          <input
            className="panel__slider"
            type="range"
            aria-label="风机数量"
            min="0"
            max="120"
            step="4"
            value={turbineCount}
            onChange={(e) => onTurbineCountChange(Number(e.target.value))}
          />
          <div className="panel__slider-value">
            <span>数量</span>
            <span>{turbineCount} 台</span>
          </div>
        </section>

        <section className="panel__section">
          <h3 className="panel__label">楼宇灯光</h3>
          <input
            className="panel__slider"
            type="range"
            aria-label="楼宇灯光亮度"
            min="0"
            max="200"
            step="5"
            value={Math.round(buildingLight * 100)}
            onChange={(e) => onBuildingLightChange(Number(e.target.value) / 100)}
          />
          <div className="panel__slider-value">
            <span>亮度</span>
            <span>{Math.round(buildingLight * 100)}%</span>
          </div>
        </section>

        <section className="panel__section panel__hint">
          <p>拖拽旋转 · 滚轮缩放 · 右键平移</p>
        </section>
      </div>

      {/* 折叠柄：贴在面板左缘竖直居中，收起后它就是唯一可见的部分 */}
      <button
        type="button"
        className="panel__collapse"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开操作栏' : '收起操作栏'}
        title={collapsed ? '展开操作栏' : '收起操作栏'}
      >
        <span className="panel__collapse-icon" />
      </button>
    </aside>
  )
}
