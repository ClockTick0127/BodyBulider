package org.ssafy.bodybuilder.domain.game.message.payload;

import com.fasterxml.jackson.databind.JsonNode;
import org.ssafy.bodybuilder.domain.game.model.GameSession;
import org.ssafy.bodybuilder.domain.game.model.StageRound;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/// 게임시작을 할때 client에게 보내줘야할 정보를 포함한 response
/// @param mapId
/// @param startedAt
/// @param round
/// @param participants 유저와 플레이어 번호 매핑
public record GameStartResponsePayload(
        Integer mapId,
        LocalDateTime startedAt,
        RoundInfo round,
        List<Participant> participants,
        List<Placement> placements,
        Integer initialDelayMs,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        List<List<Double>> waterFlows
){
    public static GameStartResponsePayload of(
            GameSession game,
            StageRound round,
            Map<UUID, Integer> participantSlots,
            int initialDelayMs,
            List<List<Double>> waterFlows
    ){
        List<Participant> participants = participantSlots.entrySet().stream()
                .map(entry -> new Participant(
                        entry.getKey(),
                        entry.getValue()
                ))
                .toList();
        Map<Integer, UUID> userIdByPlayerNo = participantSlots.entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getValue, Map.Entry::getKey));
        AtomicInteger nextCaptureNo = new AtomicInteger(1);
        List<Placement> placements = org.ssafy.bodybuilder.domain.game.util.PlayerPlacementAllocator
                .allocate(game.getGameSessionId(), participantSlots.values().stream().toList())
                .stream()
                .map(playerNo -> new Placement(
                        nextCaptureNo.getAndIncrement(),
                        userIdByPlayerNo.get(playerNo),
                        playerNo
                ))
                .toList();

        return new GameStartResponsePayload(
                game.getMapId(),
                game.getStartedAt(),
                new RoundInfo(
                        round.getId(),
                        round.getRoundNo(),
                        round.getMapConfig()
                ),
                participants,
                placements,
                initialDelayMs,
                waterFlows
        );
    }

    public record RoundInfo(
            Integer roundId,
            Integer roundNo,
            JsonNode mapConfig
    ){
    }

    public record Participant(
            UUID userId,
            Integer playerNo
    ){

    }

    public record Placement(Integer captureNo, UUID userId, Integer playerNo) {
    }

}
