package org.ssafy.bodybuilder.domain.game.physics;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * 물리 시뮬레이션 엔진 추상화.
 *
 * <p>구현체는 {@code game.physics.engine} 프로퍼티로 선택된다.
 * (legacy = 수제 구현, dyn4j = dyn4j 기반 구현)
 *
 * <p>계약:
 * <ul>
 *   <li>결정적이어야 한다 (동일 입력 → 동일 출력)</li>
 *   <li>상태를 가지지 않아야 한다 (동시 호출 안전)</li>
 *   <li>프레임은 [x, y, vx, vy] 4원소 고정 — FE gameProtocol.ts가 강제</li>
 * </ul>
 */
public interface PhysicsSimulator {

    /** 클라이언트로 보내는 프레임 간격(ms). 프레임 수 × 이 값 = 라운드 재생 시간. */
    int FRAME_INTERVAL_MS = 30;

    SimulationResult simulate(
            JsonNode mapConfig,
            List<List<List<Double>>> normalizedPoses
    );
}
