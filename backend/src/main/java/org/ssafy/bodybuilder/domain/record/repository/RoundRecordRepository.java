package org.ssafy.bodybuilder.domain.record.repository;

import java.util.List;
import org.ssafy.bodybuilder.domain.record.model.RoundRecord;
import org.ssafy.bodybuilder.domain.record.model.RoundRecordId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RoundRecordRepository extends JpaRepository<RoundRecord, RoundRecordId> {

    @Query("""
            select stageRound.roundNo as roundNo,
                   roundRecord.roundPlayTimeMs as clearTimeMs
            from RoundRecord roundRecord
            join StageRound stageRound on stageRound.id = roundRecord.roundId
            where roundRecord.stageRecordId = :recordId
            order by stageRound.roundNo asc
            """)
    List<RoundTimeProjection> findRoundTimesByRecordId(@Param("recordId") Long recordId);
}
