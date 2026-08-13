package org.ssafy.bodybuilder.domain.room.util;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Component
@RequiredArgsConstructor
public class RoomCodeGenerator {

    private static final String ROOM_CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private static final Duration ROOM_SESSION_TTL = Duration.ofHours(6);

    private final StringRedisTemplate stringRedisTemplate;

    private String roomCodeKey(String roomCode) {
        return "room:code:" + (roomCode != null ? roomCode.trim().toUpperCase() : "");
    }

    public String generateUniqueRoomCode(UUID roomId) {
        String roomCode;
        int attempts = 0;

        do {
            attempts++;
            roomCode = generateRandomCode();
            if (attempts > 100) {
                roomCode = generateRandomCode() + generateRandomCode().substring(0, 2);
            }
            String key = roomCodeKey(roomCode);
            Boolean setSuccess = stringRedisTemplate.opsForValue().setIfAbsent(key, roomId.toString(), ROOM_SESSION_TTL);
            if (Boolean.TRUE.equals(setSuccess)) {
                return roomCode;
            }
        } while (attempts < 200);

        throw new IllegalStateException("유일한 방 코드를 생성하지 못했습니다.");
    }

    private String generateRandomCode() {
        StringBuilder sb = new StringBuilder(4);
        ThreadLocalRandom random = ThreadLocalRandom.current();
        for (int i = 0; i < 4; i++) {
            int idx = random.nextInt(ROOM_CODE_CHARACTERS.length());
            sb.append(ROOM_CODE_CHARACTERS.charAt(idx));
        }
        return sb.toString();
    }
}
