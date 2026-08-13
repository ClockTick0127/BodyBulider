package org.ssafy.bodybuilder.domain.game.model;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.ssafy.bodybuilder.common.model.BaseTimeEntity;

@Entity
@Table(name = "stage_rounds")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StageRound extends BaseTimeEntity {
    @Id
    @Column(name = "round_id")
    private Integer id;

    @Column(name = "stage_id", nullable = false)
    private Integer stageId;

    @Column(name = "round_no", nullable = false)
    private Integer roundNo;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "map_config", nullable = false, columnDefinition = "json")
    private JsonNode mapConfig;

    @Builder
    public StageRound(Integer id, Integer stageId, Integer roundNo, JsonNode mapConfig) {
        this.id = id;
        this.stageId = stageId;
        this.roundNo = roundNo;
        this.mapConfig = mapConfig;
    }

    /**
     * 맵 에디터(개발 도구)에서 map_config를 교체한다.
     * 검증은 호출부(DevMapService)에서 수행한 뒤 넘어온다는 전제.
     */
    public void updateMapConfig(JsonNode mapConfig) {
        this.mapConfig = mapConfig;
    }
}