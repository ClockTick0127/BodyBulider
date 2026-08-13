package org.ssafy.bodybuilder.domain.custommap.repository;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * custom_maps + stages + users 조인 결과 한 줄.
 *
 * <p>세 엔티티 사이에 JPA 연관관계가 없으므로 JPQL 생성자 표현식으로 직접 만든다.
 * 필드 순서를 바꾸면 CustomMapRepository의 select new ... 구문도 함께 고쳐야 한다.
 */
public record CustomMapRow(
        Integer stageId,
        String title,
        String description,
        String difficulty,
        String creatorNickname,
        UUID creatorUuid,
        String palette,
        Integer polygonCount,
        Integer gimmickCount,
        Integer playCount,
        Integer likeCount,
        Boolean isCleared,
        Boolean isPublic,
        LocalDateTime createdAt
) {
}
