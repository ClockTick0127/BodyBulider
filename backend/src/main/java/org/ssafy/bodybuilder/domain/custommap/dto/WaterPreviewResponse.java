package org.ssafy.bodybuilder.domain.custommap.dto;

import java.util.List;

/**
 * 물길 프리뷰 응답 (개발명세서_BE_물기믹_유니온물길 §3).
 *
 * <p>응답 키는 dev·workshop 두 엔드포인트 모두 camelCase {@code waterFlows} 고정.
 * 빈 배열 = "물 없음"(권위적). 계산 실패는 5xx로 구분한다 — 200+빈 배열로 뭉개지 말 것.
 *
 * @param waterFlows [x1, y1, x2, y2, halfWidth] × N (게임좌표 px)
 */
public record WaterPreviewResponse(List<List<Double>> waterFlows) {
}
