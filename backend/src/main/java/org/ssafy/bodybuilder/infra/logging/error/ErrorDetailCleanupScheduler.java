package org.ssafy.bodybuilder.infra.logging.error;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.ErrorDetailJpaRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
@Slf4j
public class ErrorDetailCleanupScheduler {

    private final ErrorDetailJpaRepository errorDetailRepository;

    @Scheduled(
            initialDelayString = "${observability.error-cleanup-initial-delay-ms:60000}",
            fixedDelayString = "${observability.error-cleanup-interval-ms:3600000}"
    )
    @Transactional
    public void deleteExpiredErrors() {
        try {
            int deleted = errorDetailRepository.deleteExpired();
            if (deleted > 0) {
                log.info(
                        "[ErrorDetailCleanupScheduler] Deleted expired error details. count={}",
                        deleted
                );
            }
        } catch (RuntimeException exception) {
            log.error(
                    "[ErrorDetailCleanupScheduler] Failed to delete expired error details",
                    exception
            );
        }
    }
}
