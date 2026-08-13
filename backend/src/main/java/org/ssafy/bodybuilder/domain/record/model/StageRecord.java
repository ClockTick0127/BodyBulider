package org.ssafy.bodybuilder.domain.record.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;

@Entity
@Table(name = "stage_records")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StageRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "stage_record_id")
    private Long id;

    @Column(name = "uuid", columnDefinition = "BINARY(16)", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "stage_id", nullable = false, updatable = false)
    private Integer stageId;

    @Column(name = "stage_play_time_ms", nullable = false)
    private Long stagePlayTimeMs;

    @Column(name = "is_clear", nullable = false)
    private boolean clear;

    @Generated(event = EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    private LocalDateTime createdAt;

    public static StageRecord create(
            UUID userId,
            Integer stageId,
            Long stagePlayTimeMs,
            boolean clear
    ) {
        StageRecord record = new StageRecord();
        record.userId = userId;
        record.stageId = stageId;
        record.stagePlayTimeMs = stagePlayTimeMs;
        record.clear = clear;
        return record;
    }
}
