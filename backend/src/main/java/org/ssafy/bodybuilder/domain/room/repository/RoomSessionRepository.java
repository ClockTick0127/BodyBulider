package org.ssafy.bodybuilder.domain.room.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;

import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Repository
@RequiredArgsConstructor
public class RoomSessionRepository {

    private static final String WAITING_ROOMS_KEY = "rooms:waiting";
    private static final Duration ROOM_SESSION_TTL = Duration.ofHours(6);

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    private String roomKey(UUID roomId) {
        return "room:" + roomId;
    }

    private String roomCodeKey(String roomCode) {
        return "room:code:" + (roomCode != null ? roomCode.trim().toUpperCase() : "");
    }

    public Optional<RoomSession> findRoomById(UUID roomId) {
        if (roomId == null) return Optional.empty();
        String key = roomKey(roomId);
        Object obj = redisTemplate.opsForValue().get(key);
        if (obj == null) return Optional.empty();

        RoomSession room;
        if (obj instanceof RoomSession) {
            room = (RoomSession) obj;
        } else {
            try {
                room = objectMapper.convertValue(obj, RoomSession.class);
            } catch (IllegalArgumentException e) {
                log.error("[RoomSessionRepository] RoomSession 역직렬화 실패 - roomId: {}", roomId, e);
                throw new GlobalException(ErrorCode.INTERNAL_SERVER_ERROR);
            } catch (Exception e) {
                log.error("[RoomSessionRepository] RoomSession 변환 중 예외 발생 - roomId: {}", roomId, e);
                return Optional.empty();
            }
        }

        if (room != null) {
            redisTemplate.expire(key, ROOM_SESSION_TTL);
        }
        return Optional.ofNullable(room);
    }

    public Optional<RoomSession> findRoomByCode(String roomCode) {
        if (roomCode == null || roomCode.trim().isEmpty()) return Optional.empty();
        Object obj = redisTemplate.opsForValue().get(roomCodeKey(roomCode));
        if (obj == null) return Optional.empty();
        try {
            UUID roomId = UUID.fromString(obj.toString());
            return findRoomById(roomId);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }

    public void saveRoom(RoomSession room) {
        if (room == null || room.getRoomId() == null) return;
        String key = roomKey(room.getRoomId());
        redisTemplate.opsForValue().set(key, room, ROOM_SESSION_TTL);

        if (room.getRoomCode() != null) {
            redisTemplate.opsForValue().set(roomCodeKey(room.getRoomCode()), room.getRoomId().toString(), ROOM_SESSION_TTL);
        }

        if (room.getState() == RoomSession.RoomState.WAITING && !room.isFull()) {
            redisTemplate.opsForSet().add(WAITING_ROOMS_KEY, room.getRoomId().toString());
        } else {
            redisTemplate.opsForSet().remove(WAITING_ROOMS_KEY, room.getRoomId().toString());
        }
    }

    public List<RoomSession> findAllWaitingRooms() {
        Set<Object> members = redisTemplate.opsForSet().members(WAITING_ROOMS_KEY);
        if (members == null || members.isEmpty()) {
            return Collections.emptyList();
        }

        List<String> idStrings = new ArrayList<>();
        List<String> keys = new ArrayList<>();
        for (Object member : members) {
            if (member != null) {
                try {
                    String idStr = member.toString();
                    UUID roomId = UUID.fromString(idStr);
                    idStrings.add(idStr);
                    keys.add(roomKey(roomId));
                } catch (IllegalArgumentException e) {
                    log.warn("[RoomSessionRepository] WAITING_ROOMS_KEY member contains invalid UUID string: {}", member);
                }
            }
        }

        if (keys.isEmpty()) {
            return Collections.emptyList();
        }

        List<Object> rawRooms = redisTemplate.opsForValue().multiGet(keys);
        List<RoomSession> waitingRooms = new ArrayList<>();
        List<String> staleIds = new ArrayList<>();

        if (rawRooms != null) {
            for (int i = 0; i < keys.size(); i++) {
                Object rawObj = rawRooms.get(i);
                String idStr = idStrings.get(i);
                if (rawObj == null) {
                    staleIds.add(idStr);
                    continue;
                }
                RoomSession room = null;
                if (rawObj instanceof RoomSession) {
                    room = (RoomSession) rawObj;
                } else {
                    try {
                        room = objectMapper.convertValue(rawObj, RoomSession.class);
                    } catch (Exception e) {
                        log.warn("[RoomSessionRepository] 대기방 역직렬화 실패 - id: {}", idStr, e);
                        staleIds.add(idStr);
                        continue;
                    }
                }

                if (room != null && room.getState() == RoomSession.RoomState.WAITING && !room.isFull()) {
                    waitingRooms.add(room);
                } else {
                    staleIds.add(idStr);
                }
            }
        }

        if (!staleIds.isEmpty()) {
            redisTemplate.opsForSet().remove(WAITING_ROOMS_KEY, staleIds.toArray());
        }

        return waitingRooms;
    }

    public void removeRoom(UUID roomId) {
        if (roomId == null) return;
        Optional<RoomSession> roomOpt = findRoomById(roomId);
        redisTemplate.delete(roomKey(roomId));
        redisTemplate.opsForSet().remove(WAITING_ROOMS_KEY, roomId.toString());
        roomOpt.ifPresent(room -> {
            if (room.getRoomCode() != null) {
                redisTemplate.delete(roomCodeKey(room.getRoomCode()));
            }
        });
    }
}
