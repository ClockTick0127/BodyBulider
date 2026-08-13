/**
 * 캐릭터 스프라이트 시트 빌드 (FE-CHAR-02)
 *
 * 원화 40장은 컷마다 캔버스 크기가 달라 공통 기준점이 없다(139~194 × 124~214px).
 * 그대로 이어 붙이면 캐릭터가 뜬다. 이 스크립트가 하는 일:
 *
 *   1. 256×256 균일 캔버스로 재배치 — 정렬 모드 2종(ground / air)
 *   2. 재생 순서(sequence)를 시트에 굽는다 — CSS steps() 는 핑퐁을 표현 못 함
 *   3. manifest.json 출력 — characterSheets.ts 와 대조하는 테스트가 쓴다
 *   4. QA 어니언 스킨 출력 — 정지 이미지로는 튐을 못 잡는다
 *
 * 픽셀 리샘플링은 하지 않는다. 정수 오프셋 이동만 하므로 원본 화질이 보존된다.
 *
 * 개발명세서는 Python+Pillow 를 지정했으나 작업 환경에 Python 이 없고 이 저장소는
 * Node 툴체인을 쓰므로 Node 로 구현했다. (pngjs devDependency)
 *
 * 실행:
 *   node scripts/build_character_sprites.mjs
 *   node scripts/build_character_sprites.mjs --art "D:/경로/캐릭터_인게임_디자인(character)"
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const FRAME = 256
/** 접지선. 하단 40px 은 스쿼시·그림자 여유. CSS --ground-ratio(84.375%) 와 같아야 한다. */
const GROUND_Y = 216
/** 공중 앵커. 캔버스 중심. 접지선 기준으로 정렬하면 float 이 캔버스 밖으로 잘린다. */
const AIR_Y = 128
const PIVOT_X = 128
/** 이보다 큰 알파만 실루엣으로 본다. */
const ALPHA_THRESHOLD = 8

const here = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(here, '../src/assets/character')

const argOf = (name) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const ART_ROOT = resolve(
  argOf('--art') ?? 'C:/Users/SSAFY/Desktop/캐릭터_인게임_디자인(character)',
)

/**
 * 상태 정의. 원화 폴더만 읽는다.
 * `_정렬결과(aligned)` · `_신규아트_검수` 는 원화가 아니므로 읽지 않는다.
 *
 * sequence 는 재생 순서다. idle·fall 을 핑퐁으로 굽는 이유는 선형 나열이
 * 마지막→첫 프레임에서 튀기 때문이다. (fall 은 6→1 구간 실루엣 IoU 가 0.718 로
 * 평균 0.853 대비 뚝 떨어진다)
 */
const STATES = {
  idle: {
    dir: '1. 대기(idle)',
    mode: 'ground',
    sequence: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1],
    fps: 8,
    loop: true,
    mirrorable: false,
  },
  move: {
    dir: '4. 이동(move)',
    mode: 'ground',
    sequence: [0, 1, 2, 3, 4, 5, 6, 7],
    fps: 12,
    loop: true,
    mirrorable: true,
  },
  landing: {
    dir: '5. 착지(landing)',
    mode: 'ground',
    sequence: [0, 1, 2, 3, 4, 5],
    fps: 16,
    loop: false,
    mirrorable: false,
  },
  fall: {
    dir: '6. 추락(fall)',
    mode: 'air',
    sequence: [0, 1, 2, 3, 4, 5, 4, 3, 2, 1],
    fps: 12,
    loop: true,
    mirrorable: true,
  },
  float: {
    dir: '7. 부유(float)',
    mode: 'air',
    sequence: [0, 1, 2, 3, 4, 5],
    fps: 12,
    loop: false,
    mirrorable: false,
  },
  // 아래 3종은 전환 연출 도입에 대비해 시트만 만들어 둔다. 런타임에서 참조하지 않는다.
  conversion: {
    dir: '2. 전환(conversion)',
    mode: 'ground',
    sequence: [0, 1, 2],
    fps: 14,
    loop: false,
    mirrorable: true,
  },
  prep_start: {
    dir: '3_1. 예비(preparation)_시작(start)',
    mode: 'ground',
    sequence: [0, 1],
    fps: 12,
    loop: false,
    mirrorable: true,
  },
  prep_end: {
    dir: '3_2. 예비(preparation)_종료(end)',
    mode: 'ground',
    sequence: [0, 1, 2],
    fps: 12,
    loop: false,
    mirrorable: true,
  },
}

const readPng = (path) => PNG.sync.read(readFileSync(path))

/** 파일명 **끝 숫자**로 정렬한다. 문자열 정렬은 move_10 이 move_2 앞에 온다. */
function listFrameFiles(state, dir) {
  if (!existsSync(dir)) throw new Error(`[${state}] 원화 폴더가 없습니다: ${dir}`)

  const files = readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.png'))
    .map((name) => ({ name, n: Number(name.match(/(\d+)\s*\.png$/i)?.[1] ?? Number.NaN) }))
    .filter((item) => Number.isFinite(item.n))
    .sort((a, b) => a.n - b.n)

  if (files.length === 0) throw new Error(`[${state}] 원화 PNG 를 찾지 못했습니다: ${dir}`)
  return files.map((item) => join(dir, item.name))
}

/** 알파 bbox 와 가로 질량중심. bbox 중심을 쓰면 다리를 뻗은 프레임에서 몸통이 흔들린다. */
function measure(png) {
  let minX = png.width, maxX = -1, minY = png.height, maxY = -1
  let mass = 0, weightedX = 0

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[((png.width * y) + x) * 4 + 3]
      if (alpha <= ALPHA_THRESHOLD) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      mass += alpha
      weightedX += x * alpha
    }
  }

  if (maxX < 0) return null
  return { minX, minY, maxX, maxY, massX: weightedX / mass }
}

/**
 * 원화 1장을 256×256 캔버스에 재배치한다.
 * - 가로: 알파 질량중심 → x = 128 (두 모드 공통)
 * - 세로: ground 는 bbox 하단 → y = 216 / air 는 bbox 중심 → y = 128
 */
function alignFrame(state, path, mode) {
  const src = readPng(path)
  const box = measure(src)
  if (!box) throw new Error(`[${state}] 빈 이미지입니다: ${path}`)

  const offsetX = Math.round(PIVOT_X - box.massX)
  const offsetY = mode === 'ground'
    ? GROUND_Y - box.maxY
    : AIR_Y - Math.round((box.minY + box.maxY) / 2)

  // 조용히 잘리면 안 되므로 배치 전에 검사한다.
  const left = box.minX + offsetX
  const right = box.maxX + offsetX
  const top = box.minY + offsetY
  const bottom = box.maxY + offsetY
  if (left < 0 || right > FRAME - 1 || top < 0 || bottom > FRAME - 1) {
    throw new Error(
      `[${state}] 캔버스(${FRAME}×${FRAME})를 벗어납니다: ${path}\n`
      + `  배치 결과 x ${left}~${right}, y ${top}~${bottom} (mode=${mode})`,
    )
  }

  const out = new PNG({ width: FRAME, height: FRAME })
  for (let y = 0; y < src.height; y += 1) {
    const dy = y + offsetY
    if (dy < 0 || dy >= FRAME) continue
    for (let x = 0; x < src.width; x += 1) {
      const dx = x + offsetX
      if (dx < 0 || dx >= FRAME) continue
      const s = ((src.width * y) + x) * 4
      const d = ((FRAME * dy) + dx) * 4
      out.data[d] = src.data[s]
      out.data[d + 1] = src.data[s + 1]
      out.data[d + 2] = src.data[s + 2]
      out.data[d + 3] = src.data[s + 3]
    }
  }
  return out
}

function bakeSheet(frames, sequence) {
  const out = new PNG({ width: FRAME * sequence.length, height: FRAME })
  sequence.forEach((frameIndex, slot) => {
    const src = frames[frameIndex]
    for (let y = 0; y < FRAME; y += 1) {
      for (let x = 0; x < FRAME; x += 1) {
        const s = ((FRAME * y) + x) * 4
        const d = ((out.width * y) + (slot * FRAME + x)) * 4
        out.data[d] = src.data[s]
        out.data[d + 1] = src.data[s + 1]
        out.data[d + 2] = src.data[s + 2]
        out.data[d + 3] = src.data[s + 3]
      }
    }
  })
  return out
}

/** QA 어니언 스킨: 전 프레임 30% 겹침 + 접지선(빨강) + 중심선(파랑) */
function onionSkin(frames) {
  const out = new PNG({ width: FRAME, height: FRAME })
  for (const src of frames) {
    for (let i = 0; i < out.data.length; i += 4) {
      const alpha = src.data[i + 3] * 0.3
      if (alpha <= 2) continue
      const k = alpha / 255
      out.data[i] = Math.round(out.data[i] * (1 - k) + src.data[i] * k)
      out.data[i + 1] = Math.round(out.data[i + 1] * (1 - k) + src.data[i + 1] * k)
      out.data[i + 2] = Math.round(out.data[i + 2] * (1 - k) + src.data[i + 2] * k)
      out.data[i + 3] = Math.min(255, out.data[i + 3] + alpha)
    }
  }
  for (let x = 0; x < FRAME; x += 1) {
    const g = ((FRAME * GROUND_Y) + x) * 4
    out.data[g] = 255; out.data[g + 1] = 0; out.data[g + 2] = 0; out.data[g + 3] = 255
  }
  for (let y = 0; y < FRAME; y += 1) {
    const c = ((FRAME * y) + PIVOT_X) * 4
    out.data[c] = 0; out.data[c + 1] = 80; out.data[c + 2] = 255; out.data[c + 3] = 255
  }
  return out
}

function main() {
  if (!existsSync(ART_ROOT)) {
    console.error(`원화 폴더를 찾을 수 없습니다: ${ART_ROOT}`)
    console.error('--art 로 경로를 지정하십시오.')
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(join(OUT_DIR, 'qa'), { recursive: true })

  const manifest = {
    generatedBy: 'scripts/build_character_sprites.mjs',
    frameSize: FRAME,
    groundY: GROUND_Y,
    airY: AIR_Y,
    states: {},
  }

  for (const [state, def] of Object.entries(STATES)) {
    const paths = listFrameFiles(state, join(ART_ROOT, def.dir))
    const frames = paths.map((path) => alignFrame(state, path, def.mode))

    const maxIndex = Math.max(...def.sequence)
    if (maxIndex >= frames.length) {
      throw new Error(`[${state}] sequence 가 ${maxIndex + 1}장을 참조하는데 원화는 ${frames.length}장입니다`)
    }

    const sheet = bakeSheet(frames, def.sequence)
    const file = `duck_${state}.png`
    writeFileSync(join(OUT_DIR, file), PNG.sync.write(sheet))
    writeFileSync(join(OUT_DIR, 'qa', `${state}_onion.png`), PNG.sync.write(onionSkin(frames)))

    manifest.states[state] = {
      file,
      mode: def.mode,
      sourceFrames: frames.length,
      sheetFrames: def.sequence.length,
      sequence: def.sequence,
      fps: def.fps,
      loop: def.loop,
      mirrorable: def.mirrorable,
      size: [sheet.width, sheet.height],
    }

    console.log(
      `${state.padEnd(11)} ${def.mode.padEnd(6)} `
      + `${String(frames.length).padStart(2)}장 → ${String(def.sequence.length).padStart(2)}프레임  `
      + `${sheet.width}×${sheet.height}`,
    )
  }

  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\n완료 → ${OUT_DIR}`)
}

main()
