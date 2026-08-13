package org.ssafy.bodybuilder.domain.game.repository;

import java.util.List;
import java.util.Optional;
import org.ssafy.bodybuilder.domain.game.model.StageRound;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface StageRoundRepository extends JpaRepository<StageRound, Integer> {
    Optional<StageRound> findFirstByStageIdOrderByRoundNoAsc(Integer stageId);
    Optional<StageRound> findByStageIdAndRoundNo(
            Integer stageId,
            Integer roundNo
    );

    List<StageRound> findAllByStageIdOrderByRoundNoAsc(Integer stageId);

    /** 맵 에디터 라운드 선택 드롭다운용 전체 목록. */
    List<StageRound> findAllByOrderByStageIdAscRoundNoAsc();

    /**
     * 관리자 맵 에디터 드롭다운용 공식 라운드 목록.
     *
     * <p>StageRound에 Stage 연관관계 매핑이 없어(stageId가 단순 Integer) 파생 쿼리로 만들 수 없다.
     * 또한 @Query를 쓰면 메서드 이름의 OrderBy가 무시되므로 order by를 JPQL에 직접 쓴다.
     */
    @Query("""
            select r from StageRound r
            where r.stageId in (select s.id from Stage s where s.isOfficial = true)
            order by r.stageId asc, r.roundNo asc
            """)
    List<StageRound> findAllOfficialOrderByStageIdAscRoundNoAsc();
}
