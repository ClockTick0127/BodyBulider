package org.ssafy.bodybuilder.domain.auth.strategy;

import org.ssafy.bodybuilder.domain.auth.model.ProviderType;
import org.ssafy.bodybuilder.domain.user.model.User;

public interface SocialAuthStrategy {

    ProviderType getProvider();

    User processAuth(String credential, String redirectUri);
}
