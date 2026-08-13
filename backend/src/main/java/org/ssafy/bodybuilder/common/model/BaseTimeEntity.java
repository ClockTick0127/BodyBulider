package org.ssafy.bodybuilder.common.model;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import lombok.Getter;
import org.hibernate.annotations.Generated;
import org.hibernate.generator.EventType;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@MappedSuperclass
@Getter
public abstract class BaseTimeEntity {

    @Column(name = "created_at", nullable = false, insertable = false, updatable = false)
    @Generated(event = EventType.INSERT)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    @Generated(event = EventType.INSERT)
    private LocalDateTime updatedAt;
}
