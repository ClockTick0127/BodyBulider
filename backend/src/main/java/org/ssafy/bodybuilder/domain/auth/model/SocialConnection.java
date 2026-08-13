package org.ssafy.bodybuilder.domain.auth.model;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.ssafy.bodybuilder.common.model.BaseTimeEntity;
import org.ssafy.bodybuilder.domain.user.model.User;

@Getter
@Entity
@Table(
        name = "social_connections",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_provider", columnNames = {"provider_type", "provider_id"})
        }
)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SocialConnection extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "social_connection_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uuid", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider_type", nullable = false, length = 20)
    private ProviderType providerType;

    @Column(name = "provider_id", nullable = false)
    private String providerId;

    @Builder
    public SocialConnection(User user, ProviderType providerType, String providerId) {
        this.user = user;
        this.providerType = providerType;
        this.providerId = providerId;
    }

    public static SocialConnection create(User user, ProviderType providerType, String providerId) {
        return SocialConnection.builder()
                .user(user)
                .providerType(providerType)
                .providerId(providerId)
                .build();
    }
}
