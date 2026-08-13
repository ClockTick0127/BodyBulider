package org.ssafy.bodybuilder.domain.record.service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.nio.ByteBuffer;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.dto.StageSummaryResponse;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.ssafy.bodybuilder.domain.game.repository.StageRepository;
import org.ssafy.bodybuilder.domain.record.dto.MyRecordRoundsResponse;
import org.ssafy.bodybuilder.domain.record.dto.MyRecordRoundsResponse.RoundEntry;
import org.ssafy.bodybuilder.domain.record.dto.MyBestRecordResponse;
import org.ssafy.bodybuilder.domain.record.dto.MyStageHistoryResponse;
import org.ssafy.bodybuilder.domain.record.dto.MyStageHistoryResponse.HistoryEntry;
import org.ssafy.bodybuilder.domain.record.model.StageRecord;
import org.ssafy.bodybuilder.domain.record.repository.RoundRecordRepository;
import org.ssafy.bodybuilder.domain.record.repository.StageRecordRepository;
import org.ssafy.bodybuilder.domain.record.repository.StageRecordRepository.MyBestRecordProjection;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RecordQueryService {

    private final StageRepository stageRepository;
    private final StageRecordRepository stageRecordRepository;
    private final RoundRecordRepository roundRecordRepository;

    public List<MyBestRecordResponse> getMyRecords(UUID userId) {
        Map<Integer, Stage> stages = stageRepository.findAllByOrderByIdAsc()
                .stream()
                .collect(Collectors.toMap(Stage::getId, Function.identity()));

        return stageRecordRepository.findMyBestRecords(toBytes(userId)).stream()
                .map(row -> toMyBestRecord(row, stages))
                .toList();
    }

    public MyStageHistoryResponse getMyStageHistory(Integer stageId, UUID userId) {
        Stage stage = stageRepository.findById(stageId)
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        var records = stageRecordRepository
                .findAllByUserIdAndStageIdAndClearTrueOrderByCreatedAtDescIdDesc(userId, stageId);
        var entries = records.stream()
                .map(record -> new HistoryEntry(
                        record.getId(),
                        record.getStagePlayTimeMs(),
                        record.getCreatedAt()
                ))
                .toList();
        Long bestTimeMs = records.stream()
                .map(StageRecord::getStagePlayTimeMs)
                .min(Comparator.naturalOrder())
                .orElse(null);

        return new MyStageHistoryResponse(
                StageSummaryResponse.from(stage),
                entries,
                bestTimeMs
        );
    }

    public MyRecordRoundsResponse getMyRecordRounds(Long recordId, UUID userId) {
        StageRecord record = stageRecordRepository.findByIdAndUserIdAndClearTrue(recordId, userId)
                .orElseThrow(() -> new GlobalException(ErrorCode.RECORD_NOT_FOUND));
        Stage stage = stageRepository.findById(record.getStageId())
                .orElseThrow(() -> new GlobalException(ErrorCode.STAGE_NOT_FOUND));
        var rounds = roundRecordRepository.findRoundTimesByRecordId(recordId).stream()
                .map(round -> new RoundEntry(round.getRoundNo(), round.getClearTimeMs()))
                .toList();

        return new MyRecordRoundsResponse(
                record.getId(),
                StageSummaryResponse.from(stage),
                record.getStagePlayTimeMs(),
                rounds
        );
    }

    private MyBestRecordResponse toMyBestRecord(
            MyBestRecordProjection record,
            Map<Integer, Stage> stages
    ) {
        Stage stage = stages.get(record.getStageId());
        if (stage == null) {
            throw new GlobalException(ErrorCode.STAGE_NOT_FOUND);
        }
        return new MyBestRecordResponse(
                record.getStageId(),
                stage.getName(),
                record.getBestTimeMs(),
                record.getCreatedAt()
        );
    }

    private byte[] toBytes(UUID uuid) {
        return ByteBuffer.allocate(16)
                .putLong(uuid.getMostSignificantBits())
                .putLong(uuid.getLeastSignificantBits())
                .array();
    }
}
