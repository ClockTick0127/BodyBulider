package org.ssafy.bodybuilder.domain.custommap.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.ssafy.bodybuilder.common.model.BaseTimeEntity;

/**
 * 창작마당 유저 커스텀 맵.
 *
 * <p>스테이지 본체는 stages / stage_rounds에 is_official = false 행으로 들어가고,
 * 이 엔티티는 창작마당 전용 메타데이터(작성자·썸네일 팔레트·통계)만 보관한다.
 * description / difficulty는 stages에 이미 NOT NULL로 존재하므로 중복 보관하지 않는다.
 */
@Entity
@Table(name = "custom_maps")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CustomMap extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "custom_map_id")
    private Long id;

    @Column(name = "stage_id", nullable = false, updatable = false)
    private Integer stageId;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "creator_uuid", columnDefinition = "BINARY(16)", nullable = false, updatable = false)
    private UUID creatorUuid;

    /** '#3b5998,#8bc4e8,#f5c422' 형태의 CSV. 썸네일 3색 그라디언트용. */
    @Column(name = "palette", nullable = false, length = 64)
    private String palette;

    @Column(name = "polygon_count", nullable = false)
    private int polygonCount;

    @Column(name = "gimmick_count", nullable = false)
    private int gimmickCount;

    @Column(name = "play_count", nullable = false)
    private int playCount;

    /** Phase 1에서는 항상 0. Phase 2(좋아요) 대비 컬럼만 미리 둔다. */
    @Column(name = "like_count", nullable = false)
    private int likeCount;

    /**
     * 제작자가 제출한 포즈로 서버 물리 엔진이 실제 클리어를 재현했는지 여부.
     * 클라이언트가 보낸 플래그가 아니라 PhysicsSimulator의 판정 결과다.
     * is_public = true인 행은 항상 is_cleared = true다(공개 저장 시 검증을 강제).
     */
    @Column(name = "is_cleared", nullable = false)
    private boolean isCleared;

    @Column(name = "is_public", nullable = false)
    private boolean isPublic;

    public static CustomMap create(
            Integer stageId,
            String title,
            UUID creatorUuid,
            String palette,
            int polygonCount,
            int gimmickCount,
            boolean isCleared,
            boolean isPublic
    ) {
        CustomMap customMap = new CustomMap();
        customMap.stageId = stageId;
        customMap.title = title;
        customMap.creatorUuid = creatorUuid;
        customMap.palette = palette;
        customMap.polygonCount = polygonCount;
        customMap.gimmickCount = gimmickCount;
        customMap.playCount = 0;
        customMap.likeCount = 0;
        customMap.isCleared = isCleared;
        customMap.isPublic = isPublic;
        return customMap;
    }

    /** title은 uk_stages_name과 엮여 있어 Phase 1에서는 수정 대상이 아니다. */
    public void update(
            String palette,
            int polygonCount,
            int gimmickCount,
            boolean isCleared,
            boolean isPublic
    ) {
        this.palette = palette;
        this.polygonCount = polygonCount;
        this.gimmickCount = gimmickCount;
        this.isCleared = isCleared;
        this.isPublic = isPublic;
    }

    public boolean isOwnedBy(UUID userId) {
        return creatorUuid.equals(userId);
    }
}
