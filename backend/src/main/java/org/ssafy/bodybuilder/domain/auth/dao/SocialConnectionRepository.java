package org.ssafy.bodybuilder.domain.auth.dao;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.ssafy.bodybuilder.domain.auth.model.ProviderType;
import org.ssafy.bodybuilder.domain.auth.model.SocialConnection;

import java.util.Optional;

public interface SocialConnectionRepository extends JpaRepository<SocialConnection, Long> {

    @EntityGraph(attributePaths = {"user"})
    Optional<SocialConnection> findByProviderTypeAndProviderId(ProviderType providerType, String providerId);
}
