package org.ssafy.bodybuilder.domain.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class NicknameAvailabilityResponse {

    private boolean available;
}
