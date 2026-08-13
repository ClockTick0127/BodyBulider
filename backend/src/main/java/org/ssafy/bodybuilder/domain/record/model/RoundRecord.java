package org.ssafy.bodybuilder.domain.record.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

@Entity
@Table(name = "round_records")
@IdClass(RoundRecordId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RoundRecord {

    @Id
    @Column(name = "stage_record_id")
    private Long stageRecordId;

    @Id
    @Column(name = "round_id")
    private Integer roundId;

    @Column(name = "round_play_time_ms", nullable = false)
    private Long roundPlayTimeMs;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private LocalDateTime createdAt;

    public static RoundRecord create(
            Long stageRecordId,
            Integer roundId,
            Long roundPlayTimeMs
    ) {
        RoundRecord record = new RoundRecord();
        record.stageRecordId = stageRecordId;
        record.roundId = roundId;
        record.roundPlayTimeMs = roundPlayTimeMs;
        return record;
    }
}
