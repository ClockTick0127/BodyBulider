import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import './MapConfigViewer.css'

const MAP_SIZE = 1000

type Point = [number, number]
type Gimmick = Record<string, unknown> & { type: string }
type MapConfig = {
  startPoint: Point
  endPoint: Point
  players: Point[]
  terrain: Point[][]
  gimmicks?: Gimmick[]
}

const exampleConfig: MapConfig = {
  startPoint: [90, 870],
  endPoint: [870, 120],
  players: [[170, 760], [360, 610], [580, 420], [760, 260]],
  terrain: [
    [[0, 920], [1000, 920], [1000, 1000], [0, 1000]],
    [[250, 720], [460, 680], [470, 735], [260, 775]],
    [[590, 410], [820, 360], [830, 420], [600, 470]],
  ],
  gimmicks: [],
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => (
      typeof coordinate === 'number'
      && Number.isFinite(coordinate)
      && coordinate >= 0
      && coordinate <= MAP_SIZE
    ))
}

function extractMapConfig(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const payload = record.payload && typeof record.payload === 'object'
    ? record.payload as Record<string, unknown>
    : undefined
  const round = (payload?.round ?? record.round)
  const roundRecord = round && typeof round === 'object'
    ? round as Record<string, unknown>
    : undefined

  return roundRecord?.mapConfig
    ?? roundRecord?.map_config
    ?? payload?.mapConfig
    ?? payload?.map_config
    ?? record.mapConfig
    ?? record.map_config
    ?? record.map
    ?? value
}

function validateMapConfig(value: unknown): MapConfig {
  const config = extractMapConfig(value)
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('map-config는 JSON 객체여야 합니다.')
  }

  const record = config as Record<string, unknown>
  if (!isPoint(record.startPoint) || !isPoint(record.endPoint)) {
    throw new Error('startPoint와 endPoint는 0~1000 범위의 [x, y] 좌표여야 합니다.')
  }
  if (!Array.isArray(record.players) || !record.players.every(isPoint)) {
    throw new Error('players는 0~1000 범위의 좌표 배열이어야 합니다.')
  }
  if (!Array.isArray(record.terrain) || !record.terrain.every((polygon) => (
    Array.isArray(polygon) && polygon.length >= 3 && polygon.every(isPoint)
  ))) {
    throw new Error('terrain은 점이 3개 이상인 다각형 배열이어야 합니다.')
  }
  if (record.gimmicks !== undefined && !Array.isArray(record.gimmicks)) {
    throw new Error('gimmicks는 배열이어야 합니다.')
  }

  return {
    startPoint: record.startPoint,
    endPoint: record.endPoint,
    players: record.players,
    terrain: record.terrain as Point[][],
    gimmicks: (record.gimmicks ?? []) as Gimmick[],
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
}

function drawArrow(
  context: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color = '#d6a700',
) {
  const angle = Math.atan2(toY - fromY, toX - fromX)
  const head = 22
  context.save()
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 7
  context.beginPath()
  context.moveTo(fromX, fromY)
  context.lineTo(toX, toY)
  context.stroke()
  context.beginPath()
  context.moveTo(toX, toY)
  context.lineTo(toX - head * Math.cos(angle - Math.PI / 6), toY - head * Math.sin(angle - Math.PI / 6))
  context.lineTo(toX - head * Math.cos(angle + Math.PI / 6), toY - head * Math.sin(angle + Math.PI / 6))
  context.closePath()
  context.fill()
  context.restore()
}

function readPoint(value: unknown): Point | null {
  return isPoint(value) ? value : null
}

function readVector(value: unknown): Point | null {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    ? value as Point
    : null
}

function drawGimmicks(context: CanvasRenderingContext2D, gimmicks: Gimmick[]) {
  gimmicks.forEach((gimmick) => {
    if (gimmick.type === 'CANNON') {
      const position = readPoint(gimmick.position)
      const size = readPoint(gimmick.size)
      const velocity = readVector(gimmick.launchVelocity)
      if (!position || !size || !velocity) return
      const [x, y] = position
      context.save()
      context.translate(x, y)
      context.rotate(-0.65)
      context.fillStyle = '#f2c94c'
      context.strokeStyle = '#8b6a00'
      context.lineWidth = 5
      roundedRect(context, -size[0] / 2, -size[1] / 2, size[0], size[1], 12)
      context.fill()
      context.stroke()
      context.restore()
      drawArrow(context, x, y, x + velocity[0] * 0.32, y + velocity[1] * 0.32)
    }

    if (gimmick.type === 'WATER_PIPE') {
      const inlet = readPoint(gimmick.inlet)
      const outlet = readPoint(gimmick.outlet)
      const direction = readVector(gimmick.flowDirection)
      if (!inlet || !outlet || !direction) return
      context.save()
      context.strokeStyle = '#56ccf2'
      context.lineWidth = 22
      context.lineCap = 'round'
      context.beginPath()
      context.moveTo(...inlet)
      context.lineTo(...outlet)
      context.stroke()
      context.restore()
      drawArrow(context, outlet[0], outlet[1], outlet[0] + direction[0] * 120, outlet[1] + direction[1] * 120, '#2d9cdb')
    }

    if (gimmick.type === 'LIGHT') {
      const position = readPoint(gimmick.position)
      const radius = typeof gimmick.radius === 'number' ? gimmick.radius : null
      if (!position || radius === null) return
      const [x, y] = position
      context.save()
      const glow = context.createRadialGradient(x, y, 0, x, y, radius * 2.4)
      glow.addColorStop(0, 'rgba(255, 236, 150, 0.9)')
      glow.addColorStop(1, 'rgba(255, 236, 150, 0)')
      context.fillStyle = glow
      context.beginPath()
      context.arc(x, y, radius * 2.4, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = '#f2c94c'
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }

    if (gimmick.type === 'BLACKOUT' && typeof gimmick.delayMs === 'number') {
      context.save()
      context.fillStyle = 'rgba(17, 21, 28, 0.86)'
      roundedRect(context, 730, 25, 240, 60, 14)
      context.fill()
      context.fillStyle = '#fff'
      context.font = 'bold 22px system-ui'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(`${gimmick.delayMs / 1000}초 후 암전`, 850, 55)
      context.restore()
    }
  })
}

function renderMap(canvas: HTMLCanvasElement, config: MapConfig) {
  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
  context.fillStyle = '#f7f8fa'
  context.fillRect(0, 0, MAP_SIZE, MAP_SIZE)

  context.save()
  context.strokeStyle = '#dfe4eb'
  context.fillStyle = '#7e8998'
  context.lineWidth = 1
  context.font = '16px system-ui'
  for (let coordinate = 0; coordinate <= MAP_SIZE; coordinate += 100) {
    context.beginPath()
    context.moveTo(coordinate, 0)
    context.lineTo(coordinate, MAP_SIZE)
    context.moveTo(0, coordinate)
    context.lineTo(MAP_SIZE, coordinate)
    context.stroke()
    if (coordinate > 0 && coordinate < MAP_SIZE) {
      context.fillText(String(coordinate), coordinate + 5, 20)
      context.fillText(String(coordinate), 5, coordinate - 5)
    }
  }
  context.strokeStyle = '#8792a2'
  context.lineWidth = 3
  context.strokeRect(1.5, 1.5, MAP_SIZE - 3, MAP_SIZE - 3)
  context.restore()

  config.terrain.forEach((polygon) => {
    context.save()
    context.beginPath()
    context.moveTo(...polygon[0])
    polygon.slice(1).forEach((point) => context.lineTo(...point))
    context.closePath()
    context.fillStyle = '#202631'
    context.fill()
    context.strokeStyle = '#080a0e'
    context.lineWidth = 4
    context.stroke()
    context.restore()
  })

  drawGimmicks(context, config.gimmicks ?? [])

  config.players.forEach(([x, y], index) => {
    context.save()
    context.fillStyle = 'rgba(239, 83, 80, 0.22)'
    context.strokeStyle = '#ef5350'
    context.lineWidth = 5
    roundedRect(context, x - 57.5, y - 45, 115, 90, 14)
    context.fill()
    context.stroke()
    context.fillStyle = '#b62524'
    context.font = 'bold 30px system-ui'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(`P${index + 1}`, x, y)
    context.restore()
  })

  const drawPoint = ([x, y]: Point, color: string, label: string) => {
    context.save()
    context.fillStyle = color
    context.beginPath()
    context.arc(x, y, 21, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = '#fff'
    context.lineWidth = 5
    context.stroke()
    context.fillStyle = '#fff'
    context.font = 'bold 22px system-ui'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(label, x, y + 1)
    context.restore()
  }

  drawPoint(config.startPoint, '#2f80ed', 'S')
  const [goalX, goalY] = config.endPoint
  context.save()
  context.strokeStyle = '#219653'
  context.fillStyle = '#27ae60'
  context.lineWidth = 8
  context.beginPath()
  context.moveTo(goalX, goalY + 45)
  context.lineTo(goalX, goalY - 45)
  context.lineTo(goalX + 65, goalY - 16)
  context.lineTo(goalX, goalY + 5)
  context.fill()
  context.stroke()
  context.restore()
}

type MapConfigViewerProps = {
  incomingData?: unknown
}

export function MapConfigViewer({ incomingData }: MapConfigViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [draft, setDraft] = useState(() => JSON.stringify(exampleConfig, null, 2))
  const [config, setConfig] = useState<MapConfig>(exampleConfig)
  const [error, setError] = useState('')
  const [source, setSource] = useState<'example' | 'input' | 'file' | 'game-start'>('example')

  useEffect(() => {
    if (canvasRef.current) renderMap(canvasRef.current, config)
  }, [config])

  useEffect(() => {
    if (incomingData === undefined) return
    try {
      const nextConfig = validateMapConfig(incomingData)
      setDraft(JSON.stringify(extractMapConfig(incomingData), null, 2))
      setConfig(nextConfig)
      setSource('game-start')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? `GAME_START map-config 오류: ${caught.message}` : 'GAME_START map-config를 읽을 수 없습니다.')
    }
  }, [incomingData])

  const applyDraft = (event?: FormEvent) => {
    event?.preventDefault()
    try {
      setConfig(validateMapConfig(JSON.parse(draft)))
      setSource('input')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'JSON을 확인해 주세요.')
    }
  }

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const [file] = event.target.files ?? []
    if (!file) return
    try {
      const text = await file.text()
      const nextConfig = validateMapConfig(JSON.parse(text))
      setDraft(JSON.stringify(extractMapConfig(JSON.parse(text)), null, 2))
      setConfig(nextConfig)
      setSource('file')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'JSON 파일을 읽을 수 없습니다.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <section className="map-config-viewer" aria-labelledby="map-config-title">
      <header className="map-config-viewer__header">
        <div>
          <span>MAP CONFIG VISUALIZER</span>
          <h2 id="map-config-title">map-config JSON 미리보기</h2>
          <p>0~1000 좌표 기준으로 지형, 플레이어 시작 위치, 출발점과 도착점을 확인합니다.</p>
          <output className={`map-config-viewer__source map-config-viewer__source--${source}`} aria-live="polite">
            {source === 'game-start' ? 'GAME_START 수신 데이터' : source === 'file' ? 'JSON 파일' : source === 'input' ? '직접 입력 데이터' : '예시 데이터'}
          </output>
        </div>
        <label className="map-config-viewer__file">
          JSON 파일 열기
          <input type="file" accept=".json,application/json" onChange={(event) => void loadFile(event)} />
        </label>
      </header>

      <div className="map-config-viewer__layout">
        <form className="map-config-viewer__editor" onSubmit={applyDraft}>
          <label htmlFor="map-config-input">map-config JSON</label>
          <textarea
            id="map-config-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            aria-invalid={Boolean(error)}
          />
          {error && <p role="alert">{error}</p>}
          <button type="submit">맵 그리기</button>
        </form>

        <div className="map-config-viewer__preview">
          <div className="map-config-viewer__canvas">
            <canvas ref={canvasRef} width={MAP_SIZE} height={MAP_SIZE} aria-label="map-config 렌더링 결과" />
          </div>
          <dl>
            <div><dt>플레이어</dt><dd>{config.players.length}명</dd></div>
            <div><dt>지형</dt><dd>{config.terrain.length}개</dd></div>
            <div><dt>기믹</dt><dd>{config.gimmicks?.length ?? 0}개</dd></div>
          </dl>
        </div>
      </div>
    </section>
  )
}
