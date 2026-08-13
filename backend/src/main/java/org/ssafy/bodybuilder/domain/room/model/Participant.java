package org.ssafy.bodybuilder.domain.room.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Participant {
    private UUID userId;
    private String nickname;
    private int slotId;
    private boolean isHost;
    @Builder.Default
    private boolean isReady = false;

    public void updateHost(boolean isHost) {
        this.isHost = isHost;
        if (isHost) {
            this.isReady = true;
        }
    }

    public void toggleReady() {
        this.isReady = !this.isReady;
    }

    public void updateReady(boolean isReady) {
        this.isReady = isReady;
    }
}
