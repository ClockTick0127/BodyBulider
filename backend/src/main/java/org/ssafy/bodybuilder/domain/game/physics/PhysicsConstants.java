package org.ssafy.bodybuilder.domain.game.physics;

/**
 * 엔진 공통 물리 상수 (px 단위, 좌상단 원점, +y 아래).
 *
 * <p>튜닝 기준: ClaudeDocs/physics-parameters-qa.md 참고.
 * 값 변경 시 전 맵 재검증 필수.
 */
public final class PhysicsConstants {

    private PhysicsConstants() {
    }

    /** 맵 좌표계 크기 (1000×1000). FE CSS·맵 에디터와 공유되는 값. */
    public static final double MAP_SIZE = 1_000.0;

    /** 플레이어 포즈가 그려지는 영역 크기. */
    public static final double PLAYER_AREA_WIDTH = 230.0;
    public static final double PLAYER_AREA_HEIGHT = 180.0;

    /** 공 반지름. FE CSS(1.3cqw)에 하드코딩되어 있으므로 변경 금지. */
    public static final double BALL_RADIUS = 13.0;

    /** 포즈 로드(선분)의 캡슐 반지름. */
    public static final double ROAD_RADIUS = 4.5;

    /** 중력 가속도 (px/s², +y 아래). */
    public static final double GRAVITY = 720.0;

    /** 물리 적분 간격 (초). */
    public static final double PHYSICS_STEP = 1.0 / 180.0;

    /** 라운드당 최대 시뮬레이션 시간 (초). */
    public static final double MAX_PLAY_SECONDS = 15.0;

    /** 바닥 위 자동 이동 목표 속도 (px/s). 클리어 시간의 기준. */
    public static final double WALK_SPEED = 250.0;

    /** 걷기 가속도 (px/s²). */
    public static final double WALK_ACCELERATION = 360.0;

    /** 목표 속도 초과 시 감속도 (px/s²). */
    public static final double WALK_BRAKING = 540.0;

    /**
     * 오르막 중력 보상 비율 (0=없음, 1=완전 상쇄).
     * 접지 중 접선 방향 중력 성분을 상쇄해 등판 능력을 걷기 판정 한계(약 81°)까지 확장.
     * 0이면 등판 한계 ≈ asin(WALK_ACCELERATION/GRAVITY) - 마찰 ≈ 20°.
     */
    public static final double UPHILL_GRAVITY_COMPENSATION = 0.6;

    /**
     * 단차 극복 최대 높이 (px).
     * legacy의 200은 문제 인지된 임시 인플레값 — 볼 반경의 약 2.3배로 정상화.
     * 변경 시 전 맵 재검증 필요 (physics-parameters-qa.md §4).
     */
    public static final double MAX_STEP_HEIGHT = 30.0;

    /** 단차를 오른 직후 보장되는 최소 전진 속도 (px/s). */
    public static final double MIN_STEP_FORWARD_SPEED = 70.0;

    /**
     * step-up 홉의 턱 위 여유 고도 (px). legacy는 순간이동이라 "위로 툭툭 튀는"
     * 현상이 있었음 — 리팩토링의 핵심 동기. 턱 높이 + 이 여유만큼 도달하는
     * 자연스러운 포물선 점프로 대체.
     */
    public static final double STEP_HOP_CLEARANCE = 4.0;

    /**
     * 포즈 스무딩 강도 (px). 모션(MediaPipe) 입력의 지터를 흡수:
     * 약한 가중평균(1/6·2/3·1/6) 후 이 허용오차로 RDP 단순화.
     * 실측: 2.0이면 의도 형상 왜곡 ≈ 0 (노이즈 바닥 수준), 4.0은 관절을
     * 최대 ~10px 깎아 과함. 0이면 스무딩 없음.
     */
    public static final double POSE_SMOOTHING_EPSILON = 2.0;

    /** 포즈 스무딩 가중평균의 이웃 가중치 (중앙 = 1 - 2×이 값). */
    public static final double POSE_SMOOTHING_NEIGHBOR_WEIGHT = 1.0 / 6.0;

    /**
     * step-up 트리거 여유 거리 (px). 로드가 양면 충돌체라 dyn4j 솔버가 침투를
     * 막기 때문에, 공은 접촉거리(17.5px)에 정확히 멈추고 침투 기반 트리거
     * (distance &lt; 17.5)가 발동하지 않는다. 표면 접촉(솔버 slop 포함)에서도
     * 발동하도록 접촉거리에 이 여유를 더해 판정한다.
     */
    public static final double STEP_UP_TRIGGER_MARGIN = 2.0;

    /** 이보다 빠르게 상승 중(vy < 임계)이면 점프패드 미발동. */
    public static final double JUMP_PAD_UPWARD_SPEED_THRESHOLD = -10.0;

    /**
     * WATER_PIPE 물살 항력 계수 (1/s). 물살 안에서 공 속도가 흐름 속도로
     * 수렴하는 비율 — 클수록 세게 끌려감. 걷기 가속(360)으로 못 버티는 수준.
     */
    public static final double WATER_DRAG = 6.0;

    /**
     * 걷기 가능 판정 법선 임계값. 값이 커지면 등판각 제한이 낮아짐:
     * 등판 한계각 ≈ acos(값). 0.15=81°(legacy), 0.3=72.5°, 0.6=53°.
     * 이보다 가파른 세그먼트는 '벽'으로 분류 — 30px 이하 턱은 홉으로 넘고,
     * 그 이상이면 차단(공이 벽 앞에 멈춤).
     */
    public static final double WALKABLE_NORMAL_THRESHOLD = 0.3;
}
