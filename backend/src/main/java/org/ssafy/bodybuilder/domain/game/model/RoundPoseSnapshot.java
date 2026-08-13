package org.ssafy.bodybuilder.domain.game.model;

import java.util.List;

/**
 * 물길 브로드캐스트용 현재 라운드 포즈 스냅샷.
 *
 * @param poses 인덱스 = captureNo-1, 크기 = CAPTURE_REQUEST_COUNT.
 *              미제출 캡처는 null 엔트리 (개발명세서_BE_물기믹_유니온물길 §2-C —
 *              "각 플레이어의 최신 유효 제출 포즈", FE broadcastPoses와 동일 집합)
 */
public record RoundPoseSnapshot(
        Integer stageId,
        Integer roundNo,
        List<List<List<Double>>> poses
) {
}
