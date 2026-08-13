import { authHandlers } from './auth.handlers'
import { adminHandlers } from './admin.handlers'
import { customMapHandlers } from './customMaps.handlers'
import { rankingHandlers } from './rankings.handlers'
import { recordHandlers } from './records.handlers'
import { roomHandlers } from './rooms.handlers'
import { stageHandlers } from './stages.handlers'

export const handlers = [
  ...authHandlers,
  ...adminHandlers,
  ...roomHandlers,
  ...recordHandlers,
  // 창작마당. 파일 내부에서 /custom-maps/me·/simulate를 /custom-maps/:stageId보다 앞에 둔다.
  ...customMapHandlers,
  // 랭킹(/stages/:id/rankings)이 스테이지 상세(/stages/:id)보다 먼저 매칭되도록 앞에 둔다.
  ...rankingHandlers,
  ...stageHandlers,
]
