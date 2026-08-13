package org.ssafy.bodybuilder.domain.record.model;

import java.io.Serializable;
import java.util.Objects;

public class RoundRecordId implements Serializable {

    private Long stageRecordId;
    private Integer roundId;

    public RoundRecordId() {
    }

    public RoundRecordId(Long stageRecordId, Integer roundId) {
        this.stageRecordId = stageRecordId;
        this.roundId = roundId;
    }

    @Override
    public boolean equals(Object object) {
        if (this == object) {
            return true;
        }
        if (!(object instanceof RoundRecordId that)) {
            return false;
        }
        return Objects.equals(stageRecordId, that.stageRecordId)
                && Objects.equals(roundId, that.roundId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(stageRecordId, roundId);
    }
}
