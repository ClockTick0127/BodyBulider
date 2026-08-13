package org.ssafy.bodybuilder.domain.game.util;

public final class GameConstants{

    private GameConstants(){

    }

    public static final int MINIMUM_MEMBER_COUNT=1;
    public static final int MAXIMUM_MEMBER_COUNT=4;

    public static final int FIRST_ROUND=1;
    public static final int LAST_ROUND=3;

    public static final int ROUND_MODULAR=1_000;

    public static final int CAPTURE_INITIAL_DELAY_MS=5_000;
    public static final int CAPTURE_DURATION_MS=3_200;
    public static final int CAPTURE_REQUEST_INTERVAL_MS=3_600;
    public static final int CAPTURE_RESPONSE_GRACE_MS=1_000;
    public static final int CAPTURE_REQUEST_COUNT=4;

}
