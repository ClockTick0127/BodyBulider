package org.ssafy.bodybuilder.domain.game.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.ssafy.bodybuilder.common.model.BaseTimeEntity;

@Entity
@Table(name = "stages")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Stage extends BaseTimeEntity {

    /**
     * IDENTITY 전략은 수동 지정 ID를 무시한다.
     * 공식 스테이지는 앞으로도 마이그레이션/시드 SQL로만 생성한다.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "stage_id")
    private Integer id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "description", length = 255)
    private String description;

    @Column(name = "difficulty", nullable = false, length = 10)
    private String difficulty;

    @Column(name = "thumbnail_url", length = 255)
    private String thumbnailUrl;

    /** 공식 스테이지 여부. 유저 커스텀 맵(UGC)은 false. */
    @Column(name = "is_official", nullable = false)
    private boolean isOfficial;

    @Builder
    public Stage(
            Integer id,
            String name,
            String description,
            String difficulty,
            String thumbnailUrl,
            Boolean isOfficial
    ) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.difficulty = difficulty;
        this.thumbnailUrl = thumbnailUrl;
        // 미지정 시 공식(DB 기본값 TRUE와 동일)
        this.isOfficial = isOfficial == null || isOfficial;
    }

    /** 창작마당 유저 맵 생성용. id는 IDENTITY로 DB가 채번한다(예약 대역 10000+). */
    public static Stage createCustom(String name, String description, String difficulty) {
        Stage stage = new Stage();
        stage.name = name;
        stage.description = description;
        stage.difficulty = difficulty;
        stage.isOfficial = false;
        return stage;
    }

    /** 창작마당 맵 수정(설명·난이도). title/name은 uk_stages_name 때문에 변경하지 않는다. */
    public void updateCustomMeta(String description, String difficulty) {
        this.description = description;
        this.difficulty = difficulty;
    }
}
