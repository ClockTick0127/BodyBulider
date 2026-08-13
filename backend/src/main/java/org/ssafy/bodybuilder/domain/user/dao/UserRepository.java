package org.ssafy.bodybuilder.domain.user.dao;

import org.ssafy.bodybuilder.domain.user.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByNickname(String nickname);
    boolean existsByNickname(String nickname);
}
