package org.ssafy.bodybuilder.domain.ranking.service;

import java.nio.ByteBuffer;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.ranking.dto.MyRankingSummaryResponse;
import org.ssafy.bodybuilder.domain.ranking.dto.MyStageRankingResponse;
import org.ssafy.bodybuilder.domain.ranking.dto.StageRankingEntryResponse;
import org.ssafy.bodybuilder.domain.ranking.repository.RankingRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RankingQueryService {

    private final StageRepository stageRepository;
    private final RankingRepository rankingRepository;

    public List<StageRankingEntryResponse> getStageRanking(Integer stageId, Integer limit) {
        if (limit != null && limit <= 0) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
        if (!stageRepository.existsById(stageId)) {
            throw new GlobalException(ErrorCode.STAGE_NOT_FOUND);
        }

        int queryLimit = limit == null ? Integer.MAX_VALUE : limit;
        return rankingRepository.findStageRanking(stageId, queryLimit).stream()
                .map(StageRankingEntryResponse::from)
                .toList();
    }

    public MyRankingSummaryResponse getMyRankings(UUID userId) {
        List<MyStageRankingResponse> stages = rankingRepository
                .findMyStageRankings(toBytes(userId))
                .stream()
                .map(MyStageRankingResponse::from)
                .toList();
        return MyRankingSummaryResponse.from(stages);
    }

    private byte[] toBytes(UUID uuid) {
        return ByteBuffer.allocate(16)
                .putLong(uuid.getMostSignificantBits())
                .putLong(uuid.getLeastSignificantBits())
                .array();
    }
}
