package org.ssafy.bodybuilder.domain.user.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;
import org.ssafy.bodybuilder.common.model.BaseTimeEntity;
import org.hibernate.annotations.UuidGenerator;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Entity
@Table(name = "users")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class User extends BaseTimeEntity {
    @Id
    @UuidGenerator
    @Column(name = "uuid", columnDefinition = "BINARY(16)", nullable = false, updatable = false)
    private UUID id;

    @Size(max = 45)
    @NotNull
    @Column(name = "nickname", nullable = false, unique = true, length = 45)
    private String nickname;

    @Column(name = "password")
    private String password;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private UserRole role = UserRole.USER;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Builder(access = AccessLevel.PRIVATE)
    private User(String nickname, String password, UserRole role) {
        this.nickname = nickname;
        this.password = password;
        this.role = role != null ? role : UserRole.USER;
    }

    public static User createLocalUser(String nickname, String encodedPassword) {
        return User.builder()
                .nickname(nickname)
                .password(encodedPassword)
                .role(UserRole.USER)
                .build();
    }

    public static User createSocialUser(String nickname) {
        return User.builder()
                .nickname(nickname)
                .role(UserRole.USER)
                .build();
    }

    public static User of(String nickname) {
        return createSocialUser(nickname);
    }
}
