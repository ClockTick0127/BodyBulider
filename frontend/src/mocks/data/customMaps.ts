/**
 * 창작마당 목 데이터.
 *
 * 목 데이터는 실제 API와 같은 snake_case로 둔다. camelCase 변환은 프론트의 API 경계
 * (customMapApi.ts)에서만 하므로, 목이 변환 누락을 가려 주지 않게 하기 위함이다.
 *
 * 값은 Figma 프로토타입의 PUBLIC_MAPS 6개 + MY_MAPS(공개 1 + 비공개 1)를 옮긴 것이다.
 * (프로토타입 원본은 저장소에 두지 않는다) 검색·난이도 필터·내 맵 탭을 전부 검증할 수 있다.
 * `is_mine`은 조회 시점에 로그인 사용자와 대조해 채우므로 여기에는 두지 않는다.
 */

/** map_config 내부는 camelCase 원본이다. 서버 물리 엔진이 그대로 읽는다. */
export type MockMapConfig = {
  startPoint: [number, number]
  endPoint: [number, number]
  players: [number, number][]
  terrain: [number, number][][]
  gimmicks: Record<string, unknown>[]
}

export type MockCustomMap = {
  stage_id: number
  title: string
  description: string
  difficulty: '하' | '중' | '상'
  creator_nickname: string
  palette: string[]
  polygon_count: number
  gimmick_count: number
  play_count: number
  like_count: number
  is_public: boolean
  /** 클리어 검증 완료 여부. 공개 맵은 반드시 true 다. */
  is_cleared: boolean
  created_at: string
  map_config: MockMapConfig
}

/** 에디터 SAMPLE_A와 같은 형태의 기본 지형. 맵마다 폴리곤 수만 조금씩 다르게 준다. */
const baseMapConfig = (polygons: number, gimmicks: Record<string, unknown>[]): MockMapConfig => ({
  startPoint: [90, 870],
  endPoint: [870, 120],
  players: [
    [170, 760],
    [360, 610],
    [580, 420],
    [760, 260],
  ],
  terrain: Array.from({ length: Math.max(1, polygons) }, (_, index) => {
    const y = 920 - index * 130
    const x = 80 + index * 120
    return [
      [x, y],
      [x + 220, y - 40],
      [x + 230, y + 20],
      [x + 10, y + 60],
    ] as [number, number][]
  }),
  gimmicks,
})

/** 프로토타입 PUBLIC_MAPS의 제작자는 '정상화'다. 목 로그인 계정과 맞으면 내 맵이 된다. */
export const CUSTOM_MAP_OWNER_NICKNAME = '정상화'

export const defaultCustomMaps: MockCustomMap[] = [
  {
    stage_id: 10000,
    title: '하늘 위의 도전',
    description: '구름 위를 뛰어다니는 감각! 점프 타이밍이 핵심입니다. 바람 기믹을 잘 활용하면 훨씬 쉬워져요.',
    difficulty: '중',
    creator_nickname: CUSTOM_MAP_OWNER_NICKNAME,
    palette: ['#3b5998', '#8bc4e8', '#f5c422'],
    polygon_count: 5,
    gimmick_count: 2,
    play_count: 342,
    like_count: 87,
    is_public: true,
    is_cleared: true,
    created_at: '2026.08.01',
    map_config: baseMapConfig(5, [
      { type: 'JUMP_PAD', position: [420, 640], power: 320 },
      { type: 'WIND', band: [300, 700], strength: 120 },
    ]),
  },
  {
    stage_id: 10001,
    title: '용암 지대 탈출',
    description: '용암이 차오르는 긴박한 탈출 맵. 절대 멈추지 마세요!',
    difficulty: '상',
    creator_nickname: '김민준',
    palette: ['#c0392b', '#e67e22', '#2c3e50'],
    polygon_count: 7,
    gimmick_count: 4,
    play_count: 528,
    like_count: 134,
    is_public: true,
    is_cleared: true,
    created_at: '2026.07.28',
    map_config: baseMapConfig(7, [
      { type: 'KILL_ZONE', area: [0, 940, 1000, 1000] },
      { type: 'JUMP_PAD', position: [300, 700], power: 300 },
      { type: 'JUMP_PAD', position: [640, 480], power: 300 },
      { type: 'WIND', band: [500, 900], strength: 90 },
    ]),
  },
  {
    stage_id: 10002,
    title: '빙하 점프',
    description: '미끄러운 빙판 위를 건너는 힐링 맵. 처음 플레이하는 분께 추천!',
    difficulty: '하',
    creator_nickname: '이수아',
    palette: ['#74b9ff', '#dfe6e9', '#0984e3'],
    polygon_count: 3,
    gimmick_count: 1,
    play_count: 210,
    like_count: 45,
    is_public: true,
    is_cleared: true,
    created_at: '2026.07.30',
    map_config: baseMapConfig(3, [{ type: 'JUMP_PAD', position: [500, 620], power: 280 }]),
  },
  {
    stage_id: 10003,
    title: '바람 타고 날아라',
    description: '바람 기믹을 활용한 독창적인 구성. 방향감각이 중요합니다.',
    difficulty: '중',
    creator_nickname: '박현우',
    palette: ['#55efc4', '#00cec9', '#2d3436'],
    polygon_count: 6,
    gimmick_count: 3,
    play_count: 189,
    like_count: 62,
    is_public: true,
    is_cleared: true,
    created_at: '2026.08.02',
    map_config: baseMapConfig(6, [
      { type: 'WIND', band: [150, 500], strength: 140 },
      { type: 'WIND', band: [600, 950], strength: -110 },
      { type: 'WATER_PIPE', from: [200, 400], to: [700, 300] },
    ]),
  },
  {
    stage_id: 10004,
    title: '점프 킹 챌린지',
    description: '전설의 점프맵. 클리어하면 진정한 Body Builder!',
    difficulty: '상',
    creator_nickname: '최예린',
    palette: ['#6c5ce7', '#a29bfe', '#fdcb6e'],
    polygon_count: 8,
    gimmick_count: 5,
    play_count: 891,
    like_count: 203,
    is_public: true,
    is_cleared: true,
    created_at: '2026.07.25',
    map_config: baseMapConfig(8, [
      { type: 'JUMP_PAD', position: [220, 780], power: 340 },
      { type: 'JUMP_PAD', position: [420, 640], power: 340 },
      { type: 'JUMP_PAD', position: [620, 500], power: 340 },
      { type: 'KILL_ZONE', area: [0, 960, 1000, 1000] },
      { type: 'WIND', band: [400, 800], strength: 100 },
    ]),
  },
  {
    stage_id: 10005,
    title: '초보자 코스',
    description: '기믹 없는 순수 점프 맵. 처음 시작하는 플레이어를 위해 설계했어요.',
    difficulty: '하',
    creator_nickname: '오동욱',
    palette: ['#81ecec', '#00b894', '#dfe6e9'],
    polygon_count: 2,
    gimmick_count: 0,
    play_count: 67,
    like_count: 21,
    is_public: true,
    is_cleared: true,
    created_at: '2026.08.03',
    map_config: baseMapConfig(2, []),
  },
  {
    stage_id: 10006,
    title: '비공개 테스트맵',
    description: '개발 중인 맵입니다.',
    difficulty: '하',
    creator_nickname: CUSTOM_MAP_OWNER_NICKNAME,
    palette: ['#636e72', '#b2bec3', '#2d3436'],
    polygon_count: 3,
    gimmick_count: 1,
    play_count: 0,
    like_count: 0,
    is_public: false,
    is_cleared: false,
    created_at: '2026.08.04',
    map_config: baseMapConfig(3, [{ type: 'KILL_ZONE', area: [0, 960, 1000, 1000] }]),
  },
]
