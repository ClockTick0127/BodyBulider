-- 창작마당(UGC) Phase 1 스키마
--
-- boolean 컬럼은 V1의 stage_records.is_clear와 동일하게 TINYINT(1)을 쓴다.
-- MySQL / H2(MODE=MySQL) 양쪽에서 ddl-auto=validate 통과가 이미 검증된 형태다.

ALTER TABLE stages ADD COLUMN is_official TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE custom_maps (
    custom_map_id  BIGINT NOT NULL AUTO_INCREMENT,
    stage_id       INT NOT NULL,
    title          VARCHAR(100) NOT NULL,
    creator_uuid   BINARY(16) NOT NULL,
    palette        VARCHAR(64) NOT NULL,
    polygon_count  INT NOT NULL DEFAULT 0,
    gimmick_count  INT NOT NULL DEFAULT 0,
    play_count     INT NOT NULL DEFAULT 0,
    like_count     INT NOT NULL DEFAULT 0,
    is_public      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_custom_maps PRIMARY KEY (custom_map_id),
    CONSTRAINT uk_custom_maps_stage UNIQUE (stage_id),
    CONSTRAINT fk_custom_maps_stages
        FOREIGN KEY (stage_id) REFERENCES stages (stage_id) ON DELETE CASCADE,
    CONSTRAINT fk_custom_maps_users
        FOREIGN KEY (creator_uuid) REFERENCES users (uuid),
    INDEX idx_custom_maps_public_created (is_public, created_at),
    INDEX idx_custom_maps_creator (creator_uuid)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;
