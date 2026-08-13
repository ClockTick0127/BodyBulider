package org.ssafy.bodybuilder.domain.game.repository;

import java.util.List;
import org.ssafy.bodybuilder.domain.game.model.Stage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
//게임 시작 시 요청에 포함된 스테이지가 존재하는지 확인
public interface StageRepository extends JpaRepository<Stage, Integer> {
    List<Stage> findAllByOrderByIdAsc();

    /** 공식 스테이지 목록. 창작마당 커스텀 맵(is_official = false)은 제외한다. */
    @Query("select s from Stage s where s.isOfficial = true order by s.id asc")
    List<Stage> findAllByIsOfficialTrueOrderByIdAsc();

    /** uk_stages_name 충돌을 INSERT 전에 걸러내기 위한 확인. */
    boolean existsByName(String name);
}
