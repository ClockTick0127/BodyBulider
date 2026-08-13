package org.ssafy.bodybuilder.domain.room.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class RoomSession {

    public static final int MAX_CAPACITY = 4;
    public static final Integer DEFAULT_STAGE_ID = 1;

    private UUID roomId;
    private String roomCode;
    private String title;
    private String password;

    @JsonProperty("isSecret")
    private boolean isSecret;

    private UUID hostUserId;
    private int maxCapacity = MAX_CAPACITY;
    private RoomState state = RoomState.WAITING;
    private UUID currentGameSessionId;

    private Integer selectedStageId = DEFAULT_STAGE_ID;
    private boolean cutscenesEnabled = false;

    private Map<UUID, Participant> participants = new ConcurrentHashMap<>();
    private boolean[] slots = new boolean[MAX_CAPACITY + 1];
    private boolean hasPlayerReturnedToLobby = false;

    public enum RoomState {
        WAITING,
        PLAYING,
        FINISHED
    }

    public RoomSession(UUID roomId, String roomCode, UUID firstUserId, String firstNickname) {
        this(roomId, roomCode, "즐거운 게임 방", null, firstUserId, firstNickname);
    }

    public RoomSession(UUID roomId, String roomCode, String title, String password, UUID firstUserId, String firstNickname) {
        this.roomId = roomId;
        this.roomCode = roomCode;
        this.title = (title != null && !title.trim().isEmpty()) ? title.trim() : "즐거운 게임 방";
        this.password = (password != null && !password.trim().isEmpty()) ? password.trim() : null;
        this.isSecret = (this.password != null);
        this.hostUserId = firstUserId;
        addParticipant(firstUserId, firstNickname, true);
    }

    public boolean verifyPassword(String inputPassword) {
        if (!isSecret) {
            return true;
        }
        if (inputPassword == null) {
            return false;
        }
        return this.password.equals(inputPassword.trim());
    }

    public Participant addParticipant(UUID userId, String nickname, boolean forceHost) {
        if (participants.containsKey(userId)) {
            return participants.get(userId);
        }
        if (participants.size() >= MAX_CAPACITY) {
            throw new IllegalStateException("방의 정원이 가득 찼습니다.");
        }

        int assignedSlot = -1;
        for (int i = 1; i <= MAX_CAPACITY; i++) {
            if (!slots[i]) {
                assignedSlot = i;
                slots[i] = true;
                break;
            }
        }

        boolean isHost = forceHost || participants.isEmpty();
        if (isHost) {
            this.hostUserId = userId;
        }

        Participant participant = Participant.builder()
                .userId(userId)
                .nickname(nickname)
                .slotId(assignedSlot)
                .isHost(isHost)
                .isReady(isHost)
                .build();

        participants.put(userId, participant);
        return participant;
    }

    public boolean removeParticipant(UUID userId) {
        Participant removed = participants.remove(userId);
        if (removed != null) {
            int slot = removed.getSlotId();
            if (slot >= 1 && slot <= MAX_CAPACITY) {
                slots[slot] = false;
            }
            if (userId.equals(hostUserId) && !participants.isEmpty()) {
                UUID nextHostId = participants.keySet().iterator().next();
                this.hostUserId = nextHostId;
                Participant nextHost = participants.get(nextHostId);
                if (nextHost != null) {
                    nextHost.updateHost(true);
                }
            }
            return true;
        }
        return false;
    }

    public void startGame(UUID gameSessionId) {
        this.state = RoomState.PLAYING;
        this.currentGameSessionId = gameSessionId;
        this.hasPlayerReturnedToLobby = false;
    }

    public void finishGame() {
        this.state = RoomState.FINISHED;
        this.currentGameSessionId = null;
        this.hasPlayerReturnedToLobby = false;
        for (Participant participant : participants.values()) {
            participant.updateReady(true);
        }
    }

    public Participant returnToLobby(UUID userId) {
        if (this.state == RoomState.FINISHED) {
            this.state = RoomState.WAITING;
        }
        this.hasPlayerReturnedToLobby = true;
        Participant participant = participants.get(userId);
        if (participant != null && !participant.isHost()) {
            participant.updateReady(false);
        }
        return participant;
    }

    public Map<UUID, Participant> getParticipants() {
        return Collections.unmodifiableMap(participants);
    }

    @JsonIgnore
    public List<Participant> getParticipantList() {
        return Collections.unmodifiableList(new ArrayList<>(participants.values()));
    }

    @JsonIgnore
    public boolean isFull() {
        return participants.size() >= MAX_CAPACITY;
    }

    @JsonIgnore
    public boolean isEmpty() {
        return participants.isEmpty();
    }
}
