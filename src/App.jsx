import { useMemo, useState } from 'react'
import { BlockMath, InlineMath } from 'react-katex'
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import 'katex/dist/katex.min.css'
import './App.css'

const GRAVITY_M_PER_S2 = 9.81
const PSI_TO_KPA = 6.894757293168
const FEET_TO_METERS = 0.3048
const DEPTH_INCREMENT_M = 10
const MAX_TRUE_DEPTH_M = 500
const MAX_RKB_ELEVATION_M = 50
const DEFAULT_RKB_ELEVATION_M = 12
const PORE_PRESSURE_GRADIENT_PSI_PER_FT = 0.433
const FRACTURE_PRESSURE_GRADIENT_PSI_PER_FT = 0.7
const PORE_PRESSURE_GRADIENT_KPA_PER_M =
  (PORE_PRESSURE_GRADIENT_PSI_PER_FT * PSI_TO_KPA) / FEET_TO_METERS
const FRACTURE_PRESSURE_GRADIENT_KPA_PER_M =
  (FRACTURE_PRESSURE_GRADIENT_PSI_PER_FT * PSI_TO_KPA) / FEET_TO_METERS

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A'
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function clampRkbElevation(nextValue) {
  if (Number.isNaN(nextValue)) {
    return DEFAULT_RKB_ELEVATION_M
  }

  return Math.min(MAX_RKB_ELEVATION_M, Math.max(0, nextValue))
}

function DepthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null
  }

  const point = payload[0].payload

  return (
    <div className="chart-tooltip">
      <p className="tooltip-title">Depth below RKB: {formatNumber(label)} m</p>
      <p>True depth below ground: {formatNumber(point.trueDepthBelowGroundM)} m</p>
      <p>Pore pressure: {formatNumber(point.porePressureKPa)} kPa</p>
      <p>Fracture pressure: {formatNumber(point.fracturePressureKPa)} kPa</p>
      <p>Pore-pressure EMW: {formatNumber(point.poreEmwSg, 3)} SG</p>
      <p>Fracture-pressure EMW: {formatNumber(point.fractureEmwSg, 3)} SG</p>
    </div>
  )
}

function RigDiagram({ rkbElevationM, onRkbElevationChange }) {
  const totalHeight = 500
  const topPadding = 48
  const bottomPadding = 160
  const sandstoneHeight = 216
  const usableHeight = totalHeight - topPadding - bottomPadding
  const rkbY =
    topPadding +
    ((MAX_RKB_ELEVATION_M - rkbElevationM) / MAX_RKB_ELEVATION_M) * usableHeight
  const groundY = topPadding + usableHeight

  return (
    <section className="panel rig-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Reference Diagram</p>
        </div>
        <div className="control-group">
          <label htmlFor="rkb-elevation-range">RKB elevation above ground</label>
          <div className="control-row">
            <input
              id="rkb-elevation-range"
              type="range"
              min="0"
              max={MAX_RKB_ELEVATION_M}
              step="1"
              value={rkbElevationM}
              onChange={(event) => onRkbElevationChange(Number(event.target.value))}
            />
            <input
              type="number"
              min="0"
              max={MAX_RKB_ELEVATION_M}
              step="1"
              value={rkbElevationM}
              onChange={(event) => onRkbElevationChange(Number(event.target.value))}
              aria-label="RKB elevation in meters"
            />
            <span className="unit-label">m</span>
          </div>
        </div>
      </div>

      <svg viewBox="0 0 320 500" className="rig-diagram" aria-label="Rig elevation diagram">
        <defs>
          <linearGradient id="sandstoneGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(202, 158, 90, 0.18)" />
            <stop offset="100%" stopColor="rgba(202, 158, 90, 0.04)" />
          </linearGradient>
        </defs>

        <rect
          x="28"
          y={groundY}
          width="264"
          height={sandstoneHeight}
          fill="url(#sandstoneGradient)"
          rx="14"
        />
        <line x1="40" y1={groundY} x2="280" y2={groundY} className="ground-line" />
        <line x1="72" y1={rkbY} x2="248" y2={rkbY} className="rkb-line" />

        <line x1="96" y1={rkbY} x2="96" y2={groundY} className="derrick-leg" />
        <line x1="224" y1={rkbY} x2="224" y2={groundY} className="derrick-leg" />
        <line x1="96" y1={rkbY} x2="224" y2={groundY} className="derrick-brace" />
        <line x1="224" y1={rkbY} x2="96" y2={groundY} className="derrick-brace" />

        <line x1="268" y1={rkbY} x2="268" y2={groundY} className="measure-line" />
        <line x1="262" y1={rkbY} x2="274" y2={rkbY} className="measure-tick" />
        <line x1="262" y1={groundY} x2="274" y2={groundY} className="measure-tick" />

        <text x="40" y={groundY - 10} className="diagram-label">
          Ground Level
        </text>
        <text x="72" y={rkbY - 10} className="diagram-label rkb-label">
          RKB
        </text>
        <text x="280" y={(rkbY + groundY) / 2} className="diagram-value">
          {formatNumber(rkbElevationM)} m
        </text>
        <text x="38" y={groundY + 26} className="diagram-note">
          <tspan x="38" dy="0">
            Water-logged sandstone continues
          </tspan>
          <tspan x="38" dy="14">
            from 0 m to 500 m TVD below ground.
          </tspan>
        </text>
      </svg>
    </section>
  )
}

function Equation({ children }) {
  return (
    <div className="equation-block">
      <BlockMath math={children} />
    </div>
  )
}

function EmwDocumentationPanel() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <section className="panel documentation-panel">
      <button
        type="button"
        className="documentation-toggle"
        onClick={() => setIsExpanded((currentValue) => !currentValue)}
        aria-expanded={isExpanded}
      >
        <span className="documentation-toggle-icon" aria-hidden="true">
          {isExpanded ? '▼' : '▶'}
        </span>
        <span>Equivalent Mud Weight Demo</span>
      </button>

      <div className={`documentation-body ${isExpanded ? 'is-expanded' : ''}`}>
        <div className="documentation-content">
          <section className="documentation-section">
            <h2>Overview</h2>
            <ul>
              <li>EMW is calculated from the pressure relative to RKB.</li>
              <li>
                The measured gauge pressures in the rock are fixed and stored offset from
                ground level.
              </li>
            </ul>
          </section>

          <section className="documentation-section">
            <h2>Equations</h2>
            <Equation>{'P = \\rho g h'}</Equation>
            <Equation>{'\\rho_{eq} = \\frac{P}{g h_{RKB}}'}</Equation>
            <ul>
              <li><InlineMath math="P" /> = gauge pressure in rock</li>
              <li><InlineMath math="g" /> = 9.81 m/s²</li>
              <li><InlineMath math="h_{RKB}" /> = depth below RKB</li>
            </ul>
          </section>
        </div>
      </div>
    </section>
  )
}

function PlotSection({
  title,
  eyebrow,
  xAxisLabel,
  domain,
  tickFormatter,
  lineA,
  lineB,
  chartData,
  rkbElevationM,
  maxDisplayedDepthM,
}) {
  return (
    <section className="panel chart-panel">
      <div className="chart-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="chart-legend" aria-label={`${title} legend`}>
        <div className="legend-item">
          <span
            className="legend-swatch"
            style={{ '--legend-color': lineA.stroke }}
            aria-hidden="true"
          />
          <span>{lineA.name}</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-swatch"
            style={{ '--legend-color': lineB.stroke }}
            aria-hidden="true"
          />
          <span>{lineB.name}</span>
        </div>
      </div>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            layout="vertical"
            syncId="depthCharts"
            margin={{ top: 26, right: 18, left: 10, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(88, 104, 127, 0.22)" />
            <ReferenceArea
              y1={rkbElevationM}
              y2={maxDisplayedDepthM}
              fill="rgba(202, 158, 90, 0.08)"
            />
            <ReferenceLine
              y={rkbElevationM}
              stroke="#4d5f73"
              strokeWidth={2}
              strokeDasharray="6 6"
              label={{
                value: 'Ground Level',
                position: 'insideBottomRight',
                fill: '#4d5f73',
                fontSize: 12,
                fontWeight: 700,
              }}
            />
            <XAxis
              type="number"
              orientation="top"
              domain={domain}
              tickFormatter={tickFormatter}
            >
              <Label value={xAxisLabel} position="top" offset={14} />
            </XAxis>
            <YAxis
              type="number"
              orientation="left"
              dataKey="depthBelowRkbM"
              domain={[0, maxDisplayedDepthM]}
              tickFormatter={(value) => `${Math.round(value)}`}
            >
              <Label
                value="Depth below RKB (m)"
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: 'middle' }}
              />
            </YAxis>
            <Tooltip content={<DepthTooltip />} labelFormatter={(value) => formatNumber(value)} />
            <Line
              type="monotone"
              dataKey={lineA.dataKey}
              name={lineA.name}
              stroke={lineA.stroke}
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey={lineB.dataKey}
              name={lineB.name}
              stroke={lineB.stroke}
              strokeWidth={3}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function App() {
  const [rkbElevationM, setRkbElevationM] = useState(DEFAULT_RKB_ELEVATION_M)

  const chartData = useMemo(() => {
    const points = []

    for (
      let trueDepthBelowGroundM = 0;
      trueDepthBelowGroundM <= MAX_TRUE_DEPTH_M;
      trueDepthBelowGroundM += DEPTH_INCREMENT_M
    ) {
      const depthBelowRkbM = trueDepthBelowGroundM + rkbElevationM
      const porePressureKPa = PORE_PRESSURE_GRADIENT_KPA_PER_M * trueDepthBelowGroundM
      const fracturePressureKPa =
        FRACTURE_PRESSURE_GRADIENT_KPA_PER_M * trueDepthBelowGroundM

      // Pressure is fixed by the rock at true depth below ground.
      // Only the displayed reference depth changes when the rig floor moves.
      const porePressurePa = porePressureKPa * 1000
      const fracturePressurePa = fracturePressureKPa * 1000

      // Equivalent mud weight is derived from the RKB-referenced depth.
      // Null values prevent divide-by-zero or non-physical points from being plotted.
      const poreEmwSg =
        depthBelowRkbM > 0
          ? porePressurePa / (GRAVITY_M_PER_S2 * depthBelowRkbM) / 1000
          : null
      const fractureEmwSg =
        depthBelowRkbM > 0
          ? fracturePressurePa / (GRAVITY_M_PER_S2 * depthBelowRkbM) / 1000
          : null

      points.push({
        trueDepthBelowGroundM,
        depthBelowRkbM,
        porePressureKPa,
        fracturePressureKPa,
        poreEmwSg,
        fractureEmwSg,
      })
    }

    return points
  }, [rkbElevationM])

  const maxDisplayedDepthM = chartData.at(-1)?.depthBelowRkbM ?? MAX_TRUE_DEPTH_M
  const maxPressureKPa = chartData.at(-1)?.fracturePressureKPa ?? 0
  return (
    <main className="app-shell">
      <EmwDocumentationPanel />

      <section className="layout-grid">
        <RigDiagram
          rkbElevationM={rkbElevationM}
          onRkbElevationChange={(nextValue) => {
            setRkbElevationM(clampRkbElevation(nextValue))
          }}
        />

        <div className="chart-stack">
          <PlotSection
            eyebrow="Plot 1"
            title="Pore and Fracture Gauge Pressure"
            xAxisLabel="Gauge Pressure (kPa)"
            domain={[0, Math.ceil(maxPressureKPa / 500) * 500]}
            tickFormatter={(value) => `${Math.round(value)}`}
            lineA={{
              dataKey: 'porePressureKPa',
              name: 'Pore pressure',
              stroke: '#0b6e8a',
            }}
            lineB={{
              dataKey: 'fracturePressureKPa',
              name: 'Fracture pressure',
              stroke: '#d57a2a',
            }}
            chartData={chartData}
            rkbElevationM={rkbElevationM}
            maxDisplayedDepthM={maxDisplayedDepthM}
          />

          <PlotSection
            eyebrow="Plot 2"
            title="EMW (Equivalent Mud Weight) Ref. RKB"
            xAxisLabel="Equivalent Mud Weight (SG)"
            domain={[0, 1.7]}
            tickFormatter={(value) => value.toFixed(2)}
            lineA={{
              dataKey: 'poreEmwSg',
              name: 'Pore-pressure EMW',
              stroke: '#0b6e8a',
            }}
            lineB={{
              dataKey: 'fractureEmwSg',
              name: 'Fracture-pressure EMW',
              stroke: '#d57a2a',
            }}
            chartData={chartData}
            rkbElevationM={rkbElevationM}
            maxDisplayedDepthM={maxDisplayedDepthM}
          />
        </div>
      </section>
    </main>
  )
}

export default App
