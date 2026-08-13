package org.ssafy.bodybuilder.domain.auth.strategy;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.auth.model.ProviderType;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class SocialAuthStrategyFactory {

    private final List<SocialAuthStrategy> strategies;
    private Map<ProviderType, SocialAuthStrategy> strategyMap;

    @PostConstruct
    void init() {
        strategyMap = strategies.stream()
                .collect(Collectors.toMap(SocialAuthStrategy::getProvider, Function.identity()));
    }

    public SocialAuthStrategy getStrategy(ProviderType providerType) {
        SocialAuthStrategy strategy = strategyMap.get(providerType);
        if (strategy == null) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
        return strategy;
    }

    public SocialAuthStrategy getStrategy(String providerName) {
        try {
            ProviderType providerType = ProviderType.valueOf(providerName.toUpperCase());
            return getStrategy(providerType);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new GlobalException(ErrorCode.INVALID_INPUT_VALUE);
        }
    }
}
