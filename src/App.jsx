import { useMemo, useState } from 'react'
import { BlockMath, InlineMath } from 'react-katex'
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
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
const DEFAULT_MODEL_TYPE = 'idealized'
const FRACTURE_SURFACE_PRESSURE_KPA = 200
const MIN_DEPTH_WINDOW_M = 5
const MIN_PRESSURE_WINDOW_KPA = 25
const MIN_EMW_WINDOW_SG = 0.02
const BASE_ZOOM_STEP = 0.08
const MAX_ZOOM_STEP = 0.16
const PORE_PRESSURE_GRADIENT_PSI_PER_FT = 0.433
const FRACTURE_PRESSURE_GRADIENT_PSI_PER_FT = 0.7
const PORE_PRESSURE_GRADIENT_KPA_PER_M =
  (PORE_PRESSURE_GRADIENT_PSI_PER_FT * PSI_TO_KPA) / FEET_TO_METERS
const FRACTURE_PRESSURE_GRADIENT_KPA_PER_M =
  (FRACTURE_PRESSURE_GRADIENT_PSI_PER_FT * PSI_TO_KPA) / FEET_TO_METERS

function computePressure(depthBelowGroundM, modelType, type) {
  if (type === 'pore') {
    return PORE_PRESSURE_GRADIENT_KPA_PER_M * depthBelowGroundM
  }

  const linearPressure = FRACTURE_PRESSURE_GRADIENT_KPA_PER_M * depthBelowGroundM

  if (modelType === 'realistic') {
    return FRACTURE_SURFACE_PRESSURE_KPA + linearPressure
  }

  return linearPressure
}

function clampDepthDomain(domain, maxDepth) {
  const minSpan = Math.min(MIN_DEPTH_WINDOW_M, maxDepth)
  const nextSpan = Math.min(maxDepth, Math.max(minSpan, domain[1] - domain[0]))
  const nextStart = Math.min(Math.max(0, domain[0]), Math.max(0, maxDepth - nextSpan))

  return [nextStart, nextStart + nextSpan]
}

function clampXAxisDomain(domain, fullDomain, minWindow) {
  const [fullStart, fullEnd] = fullDomain
  const fullSpan = fullEnd - fullStart
  const minSpan = Math.min(minWindow, fullSpan)
  const nextSpan = Math.min(fullSpan, Math.max(minSpan, domain[1] - domain[0]))
  const nextStart = Math.min(
    Math.max(fullStart, domain[0]),
    Math.max(fullStart, fullEnd - nextSpan),
  )

  return [nextStart, nextStart + nextSpan]
}

function computeZoomFactor(deltaY) {
  const normalizedStep = Math.min(MAX_ZOOM_STEP, Math.abs(deltaY) / 800)
  const zoomStep = Math.max(BASE_ZOOM_STEP, normalizedStep)

  return deltaY < 0 ? 1 - zoomStep : 1 + zoomStep
}

function normalizeManualXAxisDomain(domain, minWindow) {
  const nextStart = Math.max(0, domain[0])
  const nextEnd = Math.max(nextStart + minWindow, domain[1])

  return [nextStart, nextEnd]
}

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

function buildHoverState({ point, series, chartType }) {
  if (!point || !series) {
    return null
  }

  const pressureKPa =
    series === 'pore' ? point.porePressureKPa : point.fracturePressureKPa
  const emwSg = series === 'pore' ? point.poreEmwSg : point.fractureEmwSg
  const apparentGradientKPaPerM =
    point.depthBelowRkbM > 0 ? pressureKPa / point.depthBelowRkbM : null

  if (point.depthBelowRkbM <= 0 || pressureKPa === null || emwSg === null) {
    return null
  }

  return {
    hoveredSeries: series,
    hoveredRow: point,
    chartType,
    trueDepthBelowGroundM: point.trueDepthBelowGroundM,
    depthBelowRkbM: point.depthBelowRkbM,
    pressureKPa,
    emwSg,
    apparentGradientKPaPerM,
  }
}

function DepthTooltip({ chartType, hoverState }) {
  const point = hoverState?.hoveredRow

  if (!hoverState || !point || hoverState.chartType !== chartType) {
    return null
  }

  const series = hoverState.hoveredSeries
  const pressureKPa =
    series === 'pore' ? point.porePressureKPa : point.fracturePressureKPa
  const emwSg = series === 'pore' ? point.poreEmwSg : point.fractureEmwSg
  const apparentGradientKPaPerM =
    point.depthBelowRkbM > 0 ? pressureKPa / point.depthBelowRkbM : null
  const seriesLabel = series === 'pore' ? 'Pore pressure' : 'Fracture pressure'

  return (
    <div className="chart-tooltip">
      <p className="tooltip-title">{seriesLabel}</p>
      <p>True depth below ground: {formatNumber(point.trueDepthBelowGroundM)} m</p>
      <p>Depth below RKB: {formatNumber(point.depthBelowRkbM)} m</p>
      <p>Gauge pressure: {formatNumber(pressureKPa)} kPa</p>
      <p>
        Gradient from RKB: {formatNumber(apparentGradientKPaPerM, 2)} kPa/m →{' '}
        {formatNumber(apparentGradientKPaPerM, 2)} / g = {formatNumber(emwSg, 3)} SG
      </p>
      <p className="tooltip-emphasis">
        EMW ref. RKB: <strong>{formatNumber(emwSg, 3)} SG</strong>
      </p>
    </div>
  )
}

function HoverDot({ cx, cy, payload, stroke, series, chartType, hoverState, setHoverState }) {
  if (cx === undefined || cy === undefined) {
    return null
  }

  const nextHoverState = buildHoverState({ point: payload, series, chartType })
  const isHovered =
    hoverState?.hoveredSeries === series &&
    hoverState?.depthBelowRkbM === payload.depthBelowRkbM

  return (
    <g
      onMouseEnter={() => setHoverState(nextHoverState)}
      onMouseLeave={() => setHoverState(null)}
      style={{ cursor: 'crosshair' }}
    >
      <circle cx={cx} cy={cy} r={9} fill="transparent" />
      {isHovered ? (
        <>
          <circle cx={cx} cy={cy} r={10} fill={stroke} fillOpacity={0.12} />
          <circle cx={cx} cy={cy} r={6} fill="#fff8ef" stroke={stroke} strokeWidth={3} />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={2.5} fill={stroke} fillOpacity={0.55} />
      )}
    </g>
  )
}

function RigDiagram({ rkbElevationM, onRkbElevationChange, modelType, onModelTypeChange }) {
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
        <div className="panel-controls">
          <div className="control-group compact-control-group">
            <label>Model</label>
            <div className="segmented-control" role="radiogroup" aria-label="Pressure model">
              <button
                type="button"
                className={modelType === 'idealized' ? 'is-active' : ''}
                onClick={() => onModelTypeChange('idealized')}
                aria-pressed={modelType === 'idealized'}
              >
                Idealized
              </button>
              <button
                type="button"
                className={modelType === 'realistic' ? 'is-active' : ''}
                onClick={() => onModelTypeChange('realistic')}
                aria-pressed={modelType === 'realistic'}
              >
                Realistic
              </button>
            </div>
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
  chartType,
  title,
  eyebrow,
  xAxisLabel,
  xAxisInputStep,
  xAxisDomain,
  rangeControlDomain,
  fullXAxisDomain,
  minXAxisWindow,
  tickFormatter,
  lineA,
  lineB,
  chartData,
  rkbElevationM,
  yAxisDomain,
  hoverState,
  setHoverState,
  onZoom,
  onResetZoom,
  onPan,
  zoomMode,
  rangeMode,
  onApplyManualXAxisRange,
  onClearManualXAxisRange,
}) {
  const hoveredRow = hoverState?.hoveredRow
  const [dragState, setDragState] = useState(null)
  const [isEditingAxisRange, setIsEditingAxisRange] = useState(false)
  const [axisRangeDraft, setAxisRangeDraft] = useState({
    min: xAxisDomain[0].toFixed(2),
    max: xAxisDomain[1].toFixed(2),
  })
  const showHoverGuide =
    hoveredRow &&
    chartType === 'pressure' &&
    hoverState.depthBelowRkbM > 0 &&
    hoverState.pressureKPa !== null

  return (
    <section className="panel chart-panel">
      <div className="chart-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <div className="chart-heading-actions">
          <span className="chart-zoom-label">Zoom</span>
          <button
            type="button"
            className={`chart-mode-badge is-${zoomMode}`}
            onClick={onResetZoom}
            disabled={zoomMode === 'auto'}
          >
            {zoomMode}
          </button>
        </div>
      </div>

      <div className="chart-axis-controls">
        <span className="chart-axis-label">Axis range</span>
        <div className="chart-axis-inputs">
          <div className="chart-axis-toggle" role="radiogroup" aria-label={`${title} range mode`}>
            <button
              type="button"
              className={rangeMode === 'auto' ? 'is-active' : ''}
              onClick={() => {
                setIsEditingAxisRange(false)
                setAxisRangeDraft({
                  min: String(fullXAxisDomain[0]),
                  max: String(fullXAxisDomain[1]),
                })
                onClearManualXAxisRange()
              }}
            >
              Auto
            </button>
            <button
              type="button"
              className={rangeMode === 'manual' ? 'is-active' : ''}
              onClick={() => {
                const nextMin = Number(axisRangeDraft.min)
                const nextMax = Number(axisRangeDraft.max)

                if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax) || nextMax <= nextMin) {
                  return
                }

                onApplyManualXAxisRange([nextMin, nextMax])
                setIsEditingAxisRange(false)
              }}
            >
              Manual
            </button>
          </div>
          <input
            type="number"
            step={xAxisInputStep}
            value={isEditingAxisRange ? axisRangeDraft.min : rangeControlDomain[0]}
            readOnly={rangeMode === 'auto'}
            onChange={(event) => {
              if (rangeMode === 'auto') {
                return
              }

              const nextDraft = {
                min: event.target.value,
                max: isEditingAxisRange ? axisRangeDraft.max : String(rangeControlDomain[1]),
              }

              setIsEditingAxisRange(true)
              setAxisRangeDraft(nextDraft)

              const nextMin = Number(nextDraft.min)
              const nextMax = Number(nextDraft.max)

              if (Number.isFinite(nextMin) && Number.isFinite(nextMax) && nextMax > nextMin) {
                onApplyManualXAxisRange([nextMin, nextMax])
              }
            }}
            aria-label={`${title} axis minimum`}
          />
          <span>to</span>
          <input
            type="number"
            step={xAxisInputStep}
            value={isEditingAxisRange ? axisRangeDraft.max : rangeControlDomain[1]}
            readOnly={rangeMode === 'auto'}
            onChange={(event) => {
              if (rangeMode === 'auto') {
                return
              }

              const nextDraft = {
                min: isEditingAxisRange ? axisRangeDraft.min : String(rangeControlDomain[0]),
                max: event.target.value,
              }

              setIsEditingAxisRange(true)
              setAxisRangeDraft(nextDraft)

              const nextMin = Number(nextDraft.min)
              const nextMax = Number(nextDraft.max)

              if (Number.isFinite(nextMin) && Number.isFinite(nextMax) && nextMax > nextMin) {
                onApplyManualXAxisRange([nextMin, nextMax])
              }
            }}
            aria-label={`${title} axis maximum`}
          />
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

      <div
        className={`chart-wrap ${dragState ? 'is-panning' : ''}`}
        onWheel={(event) =>
          onZoom(event, {
            fullXAxisDomain: rangeControlDomain,
            minXAxisWindow,
            currentXAxisDomain: xAxisDomain,
            currentYAxisDomain: yAxisDomain,
          })
        }
        onDoubleClick={onResetZoom}
        onMouseDown={(event) => {
          const chartBounds = event.currentTarget.getBoundingClientRect()

          setDragState({
            startClientX: event.clientX,
            startClientY: event.clientY,
            chartBounds,
            xDomain: xAxisDomain,
            yDomain: yAxisDomain,
          })
        }}
        onMouseMove={(event) => {
          if (!dragState) {
            return
          }

          onPan(event, dragState, {
            fullXAxisDomain: rangeControlDomain,
            minXAxisWindow,
          })
        }}
        onMouseUp={() => setDragState(null)}
        onMouseLeave={() => setDragState(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            layout="vertical"
            syncId="depthCharts"
            margin={{ top: 26, right: 18, left: 10, bottom: 0 }}
            onMouseLeave={() => setHoverState(null)}
          >
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(88, 104, 127, 0.22)" />
            <ReferenceArea
              y1={rkbElevationM}
              y2={yAxisDomain[1]}
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
            {hoveredRow ? (
              <ReferenceLine
                y={hoveredRow.depthBelowRkbM}
                stroke="rgba(88, 104, 127, 0.38)"
                strokeDasharray="3 5"
              />
            ) : null}
            <XAxis
              type="number"
              orientation="top"
              domain={xAxisDomain}
              allowDataOverflow
              tickFormatter={tickFormatter}
            >
              <Label value={xAxisLabel} position="top" offset={14} />
            </XAxis>
            <YAxis
              type="number"
              orientation="left"
              dataKey="depthBelowRkbM"
              domain={yAxisDomain}
              allowDataOverflow
              tickFormatter={(value) => `${Math.round(value)}`}
            >
              <Label
                value="Depth below RKB (m)"
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: 'middle' }}
              />
            </YAxis>
            <Tooltip
              content={<DepthTooltip chartType={chartType} hoverState={hoverState} />}
              cursor={{ stroke: 'rgba(88, 104, 127, 0.28)', strokeDasharray: '3 5' }}
            />
            {showHoverGuide ? (
              <Line
                type="linear"
                data={[
                  { depthBelowRkbM: 0, hoverGuideValue: 0 },
                  {
                    depthBelowRkbM: hoverState.depthBelowRkbM,
                    hoverGuideValue: hoverState.pressureKPa,
                  },
                ]}
                dataKey="hoverGuideValue"
                stroke="rgba(14, 24, 36, 0.5)"
                strokeWidth={2}
                strokeDasharray="6 5"
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
            ) : null}
            <Line
              type="monotone"
              dataKey={lineA.dataKey}
              name={lineA.name}
              stroke={lineA.stroke}
              strokeWidth={3}
              dot={
                <HoverDot
                  series={lineA.series}
                  chartType={chartType}
                  hoverState={hoverState}
                  setHoverState={setHoverState}
                />
              }
              connectNulls={false}
              activeDot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey={lineB.dataKey}
              name={lineB.name}
              stroke={lineB.stroke}
              strokeWidth={3}
              dot={
                <HoverDot
                  series={lineB.series}
                  chartType={chartType}
                  hoverState={hoverState}
                  setHoverState={setHoverState}
                />
              }
              connectNulls={false}
              activeDot={false}
              isAnimationActive={false}
            />
            {hoveredRow ? (
              <ReferenceDot
                x={chartType === 'pressure' ? hoverState.pressureKPa : hoverState.emwSg}
                y={hoverState.depthBelowRkbM}
                r={8}
                fill="#fff8ef"
                stroke={hoverState.hoveredSeries === 'pore' ? lineA.stroke : lineB.stroke}
                strokeWidth={3}
                ifOverflow="extendDomain"
              />
            ) : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function App() {
  const [rkbElevationM, setRkbElevationM] = useState(DEFAULT_RKB_ELEVATION_M)
  const [modelType, setModelType] = useState(DEFAULT_MODEL_TYPE)
  const [hoverState, setHoverState] = useState(null)

  const chartData = useMemo(() => {
    const points = []

    for (
      let trueDepthBelowGroundM = 0;
      trueDepthBelowGroundM <= MAX_TRUE_DEPTH_M;
      trueDepthBelowGroundM += DEPTH_INCREMENT_M
    ) {
      const depthBelowRkbM = trueDepthBelowGroundM + rkbElevationM
      const porePressureKPa = computePressure(trueDepthBelowGroundM, modelType, 'pore')
      const fracturePressureKPa = computePressure(
        trueDepthBelowGroundM,
        modelType,
        'fracture',
      )

      // Rock pressure is fixed relative to ground at a given true depth below ground.
      // Only the displayed reference depth changes when the rig floor moves.
      const porePressurePa = porePressureKPa * 1000
      const fracturePressurePa = fracturePressureKPa * 1000

      // EMW is computed from hovered pressure divided by depth below RKB:
      // rho_eq = P / (g * h_RKB). Changing RKB therefore changes EMW even when the
      // rock-pressure dataset itself stays unchanged relative to ground.
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
  }, [modelType, rkbElevationM])

  const sanitizedHoverState = useMemo(() => {
    if (!hoverState) {
      return null
    }

    const matchingRow = chartData.find(
      (row) => row.trueDepthBelowGroundM === hoverState.trueDepthBelowGroundM,
    )

    return matchingRow
      ? buildHoverState({
          point: matchingRow,
          series: hoverState.hoveredSeries,
          chartType: hoverState.chartType,
        })
      : null
  }, [chartData, hoverState])

  const maxDisplayedDepthM = chartData.at(-1)?.depthBelowRkbM ?? MAX_TRUE_DEPTH_M
  const maxPressureKPa = chartData.at(-1)?.fracturePressureKPa ?? 0
  const maxEmwSg = chartData.reduce((currentMax, row) => {
    const rowMax = Math.max(row.poreEmwSg ?? 0, row.fractureEmwSg ?? 0)

    return Math.max(currentMax, rowMax)
  }, 0)
  const fullPressureDomain = useMemo(
    () => [0, Math.max(500, Math.ceil(maxPressureKPa / 500) * 500)],
    [maxPressureKPa],
  )
  const fullEmwDomain = useMemo(
    () => [0, Math.max(0.5, Math.ceil(maxEmwSg * 10) / 10)],
    [maxEmwSg],
  )
  const fullDepthDomain = useMemo(() => [0, maxDisplayedDepthM], [maxDisplayedDepthM])

  const [pressureZoom, setPressureZoom] = useState(null)
  const [emwZoom, setEmwZoom] = useState(null)
  const [pressureManualXAxisRange, setPressureManualXAxisRange] = useState(null)
  const [emwManualXAxisRange, setEmwManualXAxisRange] = useState(null)
  const pressureBaseXAxisDomain = pressureManualXAxisRange ?? fullPressureDomain
  const emwBaseXAxisDomain = emwManualXAxisRange ?? fullEmwDomain
  const pressureRangeMode = pressureManualXAxisRange ? 'manual' : 'auto'
  const emwRangeMode = emwManualXAxisRange ? 'manual' : 'auto'

  const pressureXAxisDomain = useMemo(
    () =>
      pressureZoom
        ? clampXAxisDomain(pressureZoom.x, pressureBaseXAxisDomain, MIN_PRESSURE_WINDOW_KPA)
        : pressureBaseXAxisDomain,
    [pressureZoom, pressureBaseXAxisDomain],
  )
  const pressureYAxisDomain = useMemo(
    () => (pressureZoom ? clampDepthDomain(pressureZoom.y, maxDisplayedDepthM) : fullDepthDomain),
    [pressureZoom, maxDisplayedDepthM, fullDepthDomain],
  )
  const emwXAxisDomain = useMemo(
    () =>
      emwZoom
        ? clampXAxisDomain(emwZoom.x, emwBaseXAxisDomain, MIN_EMW_WINDOW_SG)
        : emwBaseXAxisDomain,
    [emwZoom, emwBaseXAxisDomain],
  )
  const emwYAxisDomain = useMemo(
    () => (emwZoom ? clampDepthDomain(emwZoom.y, maxDisplayedDepthM) : fullDepthDomain),
    [emwZoom, maxDisplayedDepthM, fullDepthDomain],
  )
  const pressureChartMode = pressureZoom ? 'zoomed' : 'auto'
  const emwChartMode = emwZoom ? 'zoomed' : 'auto'

  function handleChartZoom(event, zoomState, setZoomState, options) {
    event.preventDefault()

    const chartBounds = event.currentTarget.getBoundingClientRect()

    if (!chartBounds.width || !chartBounds.height) {
      return
    }

    const zoomFactor = computeZoomFactor(event.deltaY)
    const xRatio = Math.min(
      1,
      Math.max(0, (event.clientX - chartBounds.left) / chartBounds.width),
    )
    const yRatio = Math.min(
      1,
      Math.max(0, (event.clientY - chartBounds.top) / chartBounds.height),
    )

    const currentZoomState = zoomState ?? {
      x: options.currentXAxisDomain,
      y: options.currentYAxisDomain,
    }
    const [currentXStart, currentXEnd] = currentZoomState.x
    const [currentYStart, currentYEnd] = currentZoomState.y
    const currentXSpan = currentXEnd - currentXStart
    const currentYSpan = currentYEnd - currentYStart
    const nextXSpan = Math.min(
      options.fullXAxisDomain[1] - options.fullXAxisDomain[0],
      Math.max(options.minXAxisWindow, currentXSpan * zoomFactor),
    )
    const nextYSpan = Math.min(
      maxDisplayedDepthM,
      Math.max(Math.min(MIN_DEPTH_WINDOW_M, maxDisplayedDepthM), currentYSpan * zoomFactor),
    )
    const focusX = currentXStart + xRatio * currentXSpan
    const focusY = currentYStart + yRatio * currentYSpan
    const nextXStart = focusX - xRatio * nextXSpan
    const nextYStart = focusY - yRatio * nextYSpan

    setZoomState({
      x: clampXAxisDomain(
        [nextXStart, nextXStart + nextXSpan],
        options.fullXAxisDomain,
        options.minXAxisWindow,
      ),
      y: clampDepthDomain([nextYStart, nextYStart + nextYSpan], maxDisplayedDepthM),
    })
  }

  function handleChartPan(event, dragState, setZoomState, options) {
    event.preventDefault()

    const deltaX = event.clientX - dragState.startClientX
    const deltaY = event.clientY - dragState.startClientY
    const xSpan = dragState.xDomain[1] - dragState.xDomain[0]
    const ySpan = dragState.yDomain[1] - dragState.yDomain[0]
    const xUnitsPerPixel = xSpan / dragState.chartBounds.width
    const yUnitsPerPixel = ySpan / dragState.chartBounds.height
    const nextXStart = dragState.xDomain[0] - deltaX * xUnitsPerPixel
    const nextYStart = dragState.yDomain[0] - deltaY * yUnitsPerPixel

    setZoomState({
      x: clampXAxisDomain(
        [nextXStart, nextXStart + xSpan],
        options.fullXAxisDomain,
        options.minXAxisWindow,
      ),
      y: clampDepthDomain([nextYStart, nextYStart + ySpan], maxDisplayedDepthM),
    })
  }

  function resetPressureZoom() {
    setPressureZoom(null)
  }

  function resetEmwZoom() {
    setEmwZoom(null)
  }
  return (
    <main className="app-shell">
      <EmwDocumentationPanel />

      <section className="layout-grid">
        <RigDiagram
          rkbElevationM={rkbElevationM}
          onRkbElevationChange={(nextValue) => {
            setRkbElevationM(clampRkbElevation(nextValue))
          }}
          modelType={modelType}
          onModelTypeChange={setModelType}
        />

        <div className="chart-stack">
          <PlotSection
            chartType="pressure"
            eyebrow="Plot 1"
            title="Pore and Fracture Gauge Pressure"
            xAxisLabel="Gauge Pressure (kPa)"
            xAxisInputStep={100}
            xAxisDomain={pressureXAxisDomain}
            rangeControlDomain={pressureBaseXAxisDomain}
            fullXAxisDomain={fullPressureDomain}
            minXAxisWindow={MIN_PRESSURE_WINDOW_KPA}
            tickFormatter={(value) => `${Math.round(value)}`}
            lineA={{
              dataKey: 'porePressureKPa',
              series: 'pore',
              name: 'Pore pressure',
              stroke: '#0b6e8a',
            }}
            lineB={{
              dataKey: 'fracturePressureKPa',
              series: 'fracture',
              name: 'Fracture pressure',
              stroke: '#d57a2a',
            }}
            chartData={chartData}
            rkbElevationM={rkbElevationM}
            yAxisDomain={pressureYAxisDomain}
            hoverState={sanitizedHoverState}
            setHoverState={setHoverState}
            onZoom={(event, options) =>
              handleChartZoom(event, pressureZoom, setPressureZoom, options)
            }
            onResetZoom={resetPressureZoom}
            onPan={(event, dragState, options) =>
              handleChartPan(event, dragState, setPressureZoom, options)
            }
            zoomMode={pressureChartMode}
            rangeMode={pressureRangeMode}
            onApplyManualXAxisRange={(nextDomain) => {
              const normalizedDomain = normalizeManualXAxisDomain(
                nextDomain,
                MIN_PRESSURE_WINDOW_KPA,
              )

              setPressureManualXAxisRange(normalizedDomain)
              setPressureZoom(null)
            }}
            onClearManualXAxisRange={() => {
              setPressureManualXAxisRange(null)
              setPressureZoom(null)
            }}
          />

          <PlotSection
            chartType="emw"
            eyebrow="Plot 2"
            title="EMW (Equivalent Mud Weight) Ref. RKB"
            xAxisLabel="Equivalent Mud Weight (SG)"
            xAxisInputStep={0.1}
            xAxisDomain={emwXAxisDomain}
            rangeControlDomain={emwBaseXAxisDomain}
            fullXAxisDomain={fullEmwDomain}
            minXAxisWindow={MIN_EMW_WINDOW_SG}
            tickFormatter={(value) => value.toFixed(2)}
            lineA={{
              dataKey: 'poreEmwSg',
              series: 'pore',
              name: 'Pore-pressure EMW',
              stroke: '#0b6e8a',
            }}
            lineB={{
              dataKey: 'fractureEmwSg',
              series: 'fracture',
              name: 'Fracture-pressure EMW',
              stroke: '#d57a2a',
            }}
            chartData={chartData}
            rkbElevationM={rkbElevationM}
            yAxisDomain={emwYAxisDomain}
            hoverState={sanitizedHoverState}
            setHoverState={setHoverState}
            onZoom={(event, options) =>
              handleChartZoom(event, emwZoom, setEmwZoom, options)
            }
            onResetZoom={resetEmwZoom}
            onPan={(event, dragState, options) =>
              handleChartPan(event, dragState, setEmwZoom, options)
            }
            zoomMode={emwChartMode}
            rangeMode={emwRangeMode}
            onApplyManualXAxisRange={(nextDomain) => {
              const normalizedDomain = normalizeManualXAxisDomain(
                nextDomain,
                MIN_EMW_WINDOW_SG,
              )

              setEmwManualXAxisRange(normalizedDomain)
              setEmwZoom(null)
            }}
            onClearManualXAxisRange={() => {
              setEmwManualXAxisRange(null)
              setEmwZoom(null)
            }}
          />
        </div>
      </section>
    </main>
  )
}

export default App
