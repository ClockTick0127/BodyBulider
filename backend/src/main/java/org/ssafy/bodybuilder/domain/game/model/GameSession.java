package org.ssafy.bodybuilder.domain.game.model;

import lombok.Getter;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.util.GameConstants;

import java.time.LocalDateTime;
import java.util.UUID;


@Getter
public class GameSession {

    private final UUID gameSessionId;//session id
    private final UUID roomSessionId;//room id

    private Integer mapId;//맵 번호
    private GameStatus status;//Game의 상태
    private RoundPhase roundPhase;//진행 상태(실질적인 촬영등)

    private final LocalDateTime startedAt;//시작 시간
    private LocalDateTime endedAt;// 종료 시간

    private GameSession(
            UUID gameSessionId,
            UUID roomSessionId,
            Integer mapId,
            GameStatus status,
            RoundPhase roundPhase,
            LocalDateTime startedAt,
            LocalDateTime endedAt
    ) {
        this.gameSessionId = gameSessionId;
        this.roomSessionId = roomSessionId;
        this.mapId = mapId;
        this.status = status;
        this.roundPhase = roundPhase;
        this.startedAt = startedAt;
        this.endedAt = endedAt;
    }

    /// 현재 맵의 Stage를 가져옵니다.
    /// @return StageNo
    public int getStageId(){
        return mapId/GameConstants.ROUND_MODULAR;
    }

    /// 현재 맵이 무슨Round인지 가져옵니다.
    /// @return RoundNo
    public int getRoundNo(){
        return mapId%GameConstants.ROUND_MODULAR;
    }

    ///다음 round의 mapId를 가져옵니다.
    /// 만약 round가 최대이고 stage가 남아있다면 stage를 증가시키고 round는 다시 1로 보내야함(아직)
    public int getNextMapId(){
        if(getRoundNo()>=GameConstants.LAST_ROUND){
            throw new GlobalException(ErrorCode.STAGE_HAS_NO_ROUNDS);
        }
        return this.mapId+1;
    }

    /// 다음 round로 넘어가게 합니다.
    public void moveToNextMap() {
        validatePlaying();
        int nextMapId = getNextMapId();
        this.mapId = nextMapId;
        this.roundPhase = RoundPhase.LOADING;
    }

    /// 게임의 진행 상태를 바꿔줍니다.
    ///
    /// @param phase
    public void changePhase(RoundPhase phase) {
        validatePlaying();
        this.roundPhase = phase;
    }

    /// 게임 시작 정보를 넘겨준다.
    ///
    /// @param roomSessionId
    /// @param mapId
    /// @return
    public static GameSession start(
            UUID roomSessionId,
            Integer mapId
    ) {
        return new GameSession(
                UUID.randomUUID(),
                roomSessionId,
                mapId,
                GameStatus.PLAYING,
                RoundPhase.LOADING,
                LocalDateTime.now(),
                null
        );
    }


    ///현재 session의 status가 수정가능한 상태인지 검증
    ///
    private void validatePlaying() {
        if (status != GameStatus.PLAYING) {
            throw new GlobalException(ErrorCode.SESSION_NOT_PLAYING);
        }
    }
}
