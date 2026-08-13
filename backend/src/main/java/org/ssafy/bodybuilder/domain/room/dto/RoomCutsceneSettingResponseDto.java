package org.ssafy.bodybuilder.domain.room.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoomCutsceneSettingResponseDto {
    private UUID roomId;
    private String roomCode;

    @Getter(onMethod_ = {@JsonProperty("cutscenesEnabled")})
    private boolean cutscenesEnabled;
}
