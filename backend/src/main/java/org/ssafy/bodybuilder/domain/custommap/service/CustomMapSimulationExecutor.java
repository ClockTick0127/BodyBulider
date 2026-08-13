package org.ssafy.bodybuilder.domain.custommap.service;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.TimeUnit;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;

/**
 * 창작마당 에디터 시뮬레이션 전용 스레드풀.
 *
 * <p>일부러 java.util.concurrent.Executor를 구현하지 않는다.
 * Executor 타입 빈을 노출하면 Spring Boot의 TaskExecutionAutoConfiguration이
 * (@ConditionalOnMissingBean(Executor.class)) 꺼지면서 applicationTaskExecutor가 사라진다.
 *
 * <p>큐가 가득 차면 AbortPolicy가 RejectedExecutionException을 던지는데,
 * GlobalExceptionHandler에 catch-all(@ExceptionHandler(Exception.class))이 있어
 * 그대로 두면 500이 나간다. 여기서 잡아 TOO_MANY_REQUESTS(429)로 변환한다.
 *
 * <p>벽시계 타임아웃은 두지 않는다. PhysicsSimulator의 결정성 계약이 깨지고
 * 리플레이 재현성도 무너지기 때문이다. 무한루프 위험은 엔진 자체의 고정 상한
 * (maxSteps 2,700 / WaterFlowField 총 길이 3,000px·홉 12회 상한)이 막는다.
 */
public class CustomMapSimulationExecutor {

    private final AtomicInteger threadSequence = new AtomicInteger();

    private final ThreadPoolExecutor delegate;

    public CustomMapSimulationExecutor(int poolSize, int queueCapacity) {
        this.delegate = new ThreadPoolExecutor(
                poolSize,
                poolSize,
                0L,
                TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(queueCapacity),
                runnable -> {
                    Thread thread = new Thread(runnable);
                    thread.setName("ugc-simulation-" + threadSequence.incrementAndGet());
                    thread.setDaemon(true);
                    return thread;
                },
                new ThreadPoolExecutor.AbortPolicy()
        );
    }

    public <T> T submitAndWait(Callable<T> task) {
        Future<T> future;
        try {
            future = delegate.submit(task);
        } catch (RejectedExecutionException exception) {
            throw new GlobalException(ErrorCode.TOO_MANY_REQUESTS);
        }

        try {
            return future.get();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR, exception);
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR, exception);
        }
    }

    public void shutdown() {
        delegate.shutdown();
    }
}
