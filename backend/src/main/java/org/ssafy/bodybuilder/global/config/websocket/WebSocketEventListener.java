package org.ssafy.bodybuilder.global.config.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;
import org.springframework.web.socket.messaging.SessionSubscribeEvent;
import org.ssafy.bodybuilder.domain.room.service.RoomService;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketEventListener {

    private final RoomService roomService;

    @EventListener
    public void handleSubscribe(SessionSubscribeEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        String destination = accessor.getDestination();
        Principal principal = accessor.getUser();

        if (destination != null && (destination.startsWith("/sub/room/") || destination.startsWith("/topic/rooms/"))) {
            try {
                String roomIdStr = destination.startsWith("/sub/room/")
                        ? destination.replace("/sub/room/", "")
                        : destination.replace("/topic/rooms/", "");

                if (roomIdStr.contains("/")) {
                    roomIdStr = roomIdStr.substring(0, roomIdStr.indexOf("/"));
                }
                UUID roomId = UUID.fromString(roomIdStr);

                Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
                if (sessionAttributes != null) {
                    sessionAttributes.put("roomId", roomId);
                }

                if (principal != null) {
                    log.info("[STOMP Subscribe] User: {} subscribed to Room: {}", principal.getName(), roomId);
                }
            } catch (Exception e) {
                log.error("Failed to process subscribe event for destination: {}", destination, e);
            }
        }
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        Principal principal = accessor.getUser();

        if (sessionAttributes != null && principal != null) {
            UUID roomId = (UUID) sessionAttributes.get("roomId");
            if (roomId != null) {
                try {
                    UUID userId = UUID.fromString(principal.getName());
                    log.info("[STOMP Disconnect] User: {} left Room: {}", userId, roomId);
                    roomService.leaveRoom(roomId, userId);
                } catch (IllegalArgumentException e) {
                    log.error("Failed to parse UUID from principal name: {}", principal.getName(), e);
                }
            }
        }
    }
}
