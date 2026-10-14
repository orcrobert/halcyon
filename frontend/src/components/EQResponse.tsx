import { useMemo } from 'react'
import { sliderBands, type EQState } from '../hooks/useAudioEngine'
import { chainResponseDb, formatHz, logFrequencies } from '../hooks/eqResponse'
import type { EQBand } from '../types'

interface Props {
  mixerBands: EQBand[]
  eq: EQState
}

const WIDTH = 284
const HEIGHT = 92
const RANGE_DB = 12
const POINTS = 120
const GRID_HZ = [100, 1000, 10000]
const FREQS = logFrequencies(POINTS)
const LOG_MIN = Math.log(FREQS[0])
const LOG_SPAN = Math.log(FREQS[FREQS.length - 1]) - LOG_MIN

const SOURCE_LABEL: Record<NonNullable<EQBand['source']>, string> = {
  tone: 'Tone',
  masking: 'Makes room',
  both: 'Tone · makes room',
}

const SOURCE_HINT: Record<NonNullable<EQBand['source']>, string> = {
  tone: 'Corrects this layer on its own: rumble, harsh highs, boxy low-mids',
  masking: 'Cut where this layer buried a more important one',
  both: 'A tone correction and a masking cut at the same spot',
}

function xFor(freq: number): number {
  return ((Math.log(freq) - LOG_MIN) / LOG_SPAN) * WIDTH
}

function yFor(db: number): number {
  const clamped = Math.max(-RANGE_DB, Math.min(RANGE_DB, db))
  return HEIGHT / 2 - (clamped / RANGE_DB) * (HEIGHT / 2)
}

function pathFor(response: number[]): string {
  return response
    .map((db, i) => `${i === 0 ? 'M' : 'L'}${xFor(FREQS[i]).toFixed(1)},${yFor(db).toFixed(1)}`)
    .join(' ')
}

function bandShape(band: EQBand): string {
  if (band.type === 'lowshelf') return 'low shelf'
  if (band.type === 'highshelf') return 'high shelf'
  return 'peak'
}

export function EQResponse({ mixerBands, eq }: Props) {
  const mixer = useMemo(() => chainResponseDb(mixerBands, FREQS), [mixerBands])
  const sliders = useMemo(() => chainResponseDb(sliderBands(eq), FREQS), [eq])
  const total = mixer.map((db, i) => db + sliders[i])
  const mixerPath = pathFor(mixer)
  const zero = yFor(0)
  const sorted = [...mixerBands].sort((a, b) => a.freq - b.freq)

  return (
    <div style={{ marginBottom: '22px' }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        preserveAspectRatio="none"
        role="img"
        aria-label="Frequency response of this layer's EQ"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {[-6, 6].map((db) => (
          <line
            key={db}
            x1={0} x2={WIDTH} y1={yFor(db)} y2={yFor(db)}
            stroke="color-mix(in srgb, var(--color-wash) 5%, transparent)"
            strokeDasharray="2 4"
          />
        ))}
        {GRID_HZ.map((hz) => (
          <line
            key={hz}
            x1={xFor(hz)} x2={xFor(hz)} y1={0} y2={HEIGHT}
            stroke="color-mix(in srgb, var(--color-wash) 5%, transparent)"
          />
        ))}
        <line
          x1={0} x2={WIDTH} y1={zero} y2={zero}
          stroke="color-mix(in srgb, var(--color-wash) 12%, transparent)"
        />
        <path
          d={`${mixerPath} L${WIDTH},${zero} L0,${zero} Z`}
          fill="color-mix(in srgb, var(--color-ink-muted) 14%, transparent)"
        />
        <path
          d={mixerPath}
          fill="none"
          stroke="var(--color-ink-muted)"
          strokeWidth={1.25}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={pathFor(total)}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
        {GRID_HZ.map((hz) => (
          <span key={hz} style={{ fontSize: '9px', color: 'var(--color-ink-whisper)' }}>
            {formatHz(hz)}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '14px', marginTop: '10px', fontSize: '10px', color: 'var(--color-ink-faint)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', borderTop: '1.5px dashed var(--color-ink-muted)' }} />
          Mixer
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', borderTop: '2px solid var(--color-accent)' }} />
          Mixer + sliders
        </span>
      </div>

      <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {sorted.length === 0 ? (
          <span style={{ fontSize: '11px', color: 'var(--color-ink-ghost)' }}>
            The mixer left this layer flat.
          </span>
        ) : (
          sorted.map((band, i) => (
            <div
              key={`${band.type}-${band.freq}-${i}`}
              title={band.source ? SOURCE_HINT[band.source] : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: '56px 1fr auto',
                alignItems: 'baseline',
                gap: '10px',
                fontSize: '11px',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span style={{ color: 'var(--color-ink-soft)', fontWeight: 700 }}>
                {band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)} dB
              </span>
              <span style={{ color: 'var(--color-ink-dim)' }}>
                {formatHz(band.freq)} {bandShape(band)}
              </span>
              <span style={{ color: 'var(--color-ink-ghost)', fontSize: '10px', letterSpacing: '0.04em' }}>
                {band.source ? SOURCE_LABEL[band.source] : 'Mixer'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
