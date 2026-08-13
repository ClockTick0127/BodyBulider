-- 창작마당 클리어 검증 결과.
--
-- 버전이 V5인 이유: V4는 벤더 분리 마이그레이션(db/vendor/{mysql,h2})이 이미 쓰고 있다.
-- Flyway는 위치가 달라도 버전이 중복되면 "Found more than one migration with version 4"로
-- 기동에 실패하므로, 공통 마이그레이션은 V5부터 이어간다.
--
-- boolean은 V3(custom_maps.is_public), V1(stage_records.is_clear)과 동일하게 TINYINT(1).
ALTER TABLE custom_maps
    ADD COLUMN is_cleared TINYINT(1) NOT NULL DEFAULT 0 AFTER like_count;
