package org.ssafy.bodybuilder.domain.custommap.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ssafy.bodybuilder.domain.custommap.model.CustomMap;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface CustomMapRepository extends JpaRepository<CustomMap, Long> {

    Optional<CustomMap> findByStageId(Integer stageId);

    /** RoomService의 비공개 맵 플레이 차단용. */
    @Query("""
            select case when count(c) > 0 then true else false end
            from CustomMap c
            where c.stageId = :stageId and c.isPublic = true
            """)
    boolean existsPublicByStageId(@Param("stageId") Integer stageId);

    /**
     * 공개 맵 목록. search는 호출부에서 '%키워드%' 형태(소문자)로 만들어 넘기거나 null.
     * difficulty는 stages.difficulty와 정확히 일치하거나 null.
     */
    @Query("""
            select new org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRow(
                c.stageId, c.title, s.description, s.difficulty, u.nickname, c.creatorUuid,
                c.palette, c.polygonCount, c.gimmickCount, c.playCount, c.likeCount,
                c.isCleared, c.isPublic, c.createdAt)
            from CustomMap c
            join Stage s on s.id = c.stageId
            join User u on u.id = c.creatorUuid
            where c.isPublic = true
              and (:difficulty is null or s.difficulty = :difficulty)
              and (:search is null
                   or lower(c.title) like :search
                   or lower(u.nickname) like :search)
            order by c.createdAt desc
            """)
    List<CustomMapRow> findPublicRows(
            @Param("search") String search,
            @Param("difficulty") String difficulty
    );

    /** 내 맵 목록 — 비공개 포함 전체. */
    @Query("""
            select new org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRow(
                c.stageId, c.title, s.description, s.difficulty, u.nickname, c.creatorUuid,
                c.palette, c.polygonCount, c.gimmickCount, c.playCount, c.likeCount,
                c.isCleared, c.isPublic, c.createdAt)
            from CustomMap c
            join Stage s on s.id = c.stageId
            join User u on u.id = c.creatorUuid
            where c.creatorUuid = :creatorUuid
            order by c.createdAt desc
            """)
    List<CustomMapRow> findRowsByCreator(@Param("creatorUuid") UUID creatorUuid);

    @Query("""
            select new org.ssafy.bodybuilder.domain.custommap.repository.CustomMapRow(
                c.stageId, c.title, s.description, s.difficulty, u.nickname, c.creatorUuid,
                c.palette, c.polygonCount, c.gimmickCount, c.playCount, c.likeCount,
                c.isCleared, c.isPublic, c.createdAt)
            from CustomMap c
            join Stage s on s.id = c.stageId
            join User u on u.id = c.creatorUuid
            where c.stageId = :stageId
            """)
    Optional<CustomMapRow> findRowByStageId(@Param("stageId") Integer stageId);

    /** 게임 시작 시점 기준 플레이 수 증가. 원자적으로 처리한다. */
    @Transactional
    @Modifying(clearAutomatically = true)
    @Query("update CustomMap c set c.playCount = c.playCount + 1 where c.stageId = :stageId")
    int increasePlayCount(@Param("stageId") Integer stageId);
}
