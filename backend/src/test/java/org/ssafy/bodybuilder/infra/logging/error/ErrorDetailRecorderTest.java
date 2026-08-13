package org.ssafy.bodybuilder.infra.logging.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLiveEventPublisher;
import org.ssafy.bodybuilder.infra.logging.admin.AdminLogResponses.ErrorSummary;
import org.ssafy.bodybuilder.infra.logging.persistence.model.ErrorDetailEntity;
import org.ssafy.bodybuilder.infra.logging.persistence.repository.ErrorDetailJpaRepository;

class ErrorDetailRecorderTest {

    @Test
    void publishesErrorDeltaAfterPersistence() {
        ErrorDetailJpaRepository repository = mock(ErrorDetailJpaRepository.class);
        AdminLiveEventPublisher publisher = mock(AdminLiveEventPublisher.class);
        when(repository.save(any(ErrorDetailEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        ErrorDetailRecorder recorder = new ErrorDetailRecorder(
                repository,
                new ObjectMapper(),
                Clock.fixed(Instant.parse("2026-08-01T01:00:00Z"), ZoneOffset.UTC),
                publisher
        );

        var errorId = recorder.record(
                "REST",
                new IllegalStateException("failed"),
                "C004",
                null,
                null,
                null,
                null,
                Map.of("path", "/test")
        );

        ArgumentCaptor<ErrorSummary> captor =
                ArgumentCaptor.forClass(ErrorSummary.class);
        verify(publisher).publishErrorCreated(captor.capture());
        assertThat(errorId).contains(captor.getValue().errorId());
        assertThat(captor.getValue().source()).isEqualTo("REST");
        assertThat(captor.getValue().message()).isEqualTo("failed");
    }
}
