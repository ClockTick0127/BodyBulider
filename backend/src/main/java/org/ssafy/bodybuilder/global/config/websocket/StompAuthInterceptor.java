package org.ssafy.bodybuilder.global.config.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Component;

import org.springframework.messaging.MessageDeliveryException;
import org.ssafy.bodybuilder.domain.room.model.RoomSession;
import org.ssafy.bodybuilder.domain.room.repository.RoomSessionRepository;

import java.security.Principal;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class StompAuthInterceptor implements ChannelInterceptor {

    private final RoomSessionRepository roomSessionRepository;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && accessor.getCommand() != null) {
            StompCommand command = accessor.getCommand();

            if (StompCommand.CONNECT.equals(command)) {
                Authentication authentication = extractAuthentication(accessor);
                if (authentication != null && authentication.isAuthenticated()) {
                    if (!accessor.isMutable()) {
                        accessor = StompHeaderAccessor.wrap(message);
                    }
                    accessor.setUser(authentication);
                    log.info("[STOMP CONNECT] Authentication bound successfully. User: {}", authentication.getName());
                    return MessageBuilder.createMessage(message.getPayload(), accessor.getMessageHeaders());
                } else {
                    log.warn("[STOMP CONNECT] No authentication found in session or headers. Rejecting connection.");
                    throw new MessageDeliveryException("STOMP CONNECT authentication required");
                }
            }

            if (StompCommand.SUBSCRIBE.equals(command)) {
                Principal principal = accessor.getUser();
                if (principal == null || principal.getName() == null) {
                    log.warn("[STOMP SUBSCRIBE] Unauthenticated subscribe request. Rejecting.");
                    throw new MessageDeliveryException("STOMP SUBSCRIBE authentication required");
                }

                String destination = accessor.getDestination();
                if (destination != null) {
                    validateAdminSubscription(destination, accessor.getUser());
                    validateSubscribeDestination(destination, principal.getName());
                }
            }
        }

        return message;
    }

    private void validateAdminSubscription(String destination, Principal principal) {
        if (!destination.startsWith("/topic/admin/")) {
            return;
        }
        if (!(principal instanceof Authentication authentication)
                || authentication.getAuthorities().stream()
                .noneMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()))) {
            log.warn(
                    "[STOMP SUBSCRIBE] Non-admin attempted to subscribe to admin destination: {}",
                    destination
            );
            throw new MessageDeliveryException("Admin role required");
        }
    }

    private void validateSubscribeDestination(String destination, String principalName) {
        String roomIdStr = null;
        if (destination.startsWith("/sub/room/")) {
            roomIdStr = destination.substring("/sub/room/".length());
        } else if (destination.startsWith("/topic/rooms/")) {
            roomIdStr = destination.substring("/topic/rooms/".length());
        }

        if (roomIdStr == null || roomIdStr.isEmpty()) {
            return;
        }

        if (roomIdStr.contains("/user/")) {
            int userIdx = roomIdStr.indexOf("/user/");
            String targetUserIdStr = roomIdStr.substring(userIdx + "/user/".length());
            roomIdStr = roomIdStr.substring(0, userIdx);

            if (targetUserIdStr.contains("/")) {
                targetUserIdStr = targetUserIdStr.substring(0, targetUserIdStr.indexOf("/"));
            }

            if (!targetUserIdStr.equalsIgnoreCase(principalName)) {
                log.warn("[STOMP SUBSCRIBE Security Warning] User {} attempted to subscribe to user {}'s channel: {}",
                        principalName, targetUserIdStr, destination);
                throw new MessageDeliveryException("Cannot subscribe to another user's private channel");
            }
        } else if (roomIdStr.contains("/")) {
            roomIdStr = roomIdStr.substring(0, roomIdStr.indexOf("/"));
        }

        try {
            UUID roomId = UUID.fromString(roomIdStr);
            UUID userId = UUID.fromString(principalName);

            RoomSession room = roomSessionRepository.findRoomById(roomId)
                    .orElseThrow(() -> new MessageDeliveryException("Room not found: " + roomId));

            if (!room.getParticipants().containsKey(userId)) {
                log.warn("[STOMP SUBSCRIBE Security Warning] User {} is not a participant in room {}", principalName, roomId);
                throw new MessageDeliveryException("User is not a participant in room: " + roomId);
            }
        } catch (IllegalArgumentException e) {
            log.error("[STOMP SUBSCRIBE] Failed to parse UUID from destination or principal name. Destination: {}, Principal: {}",
                    destination, principalName, e);
            throw new MessageDeliveryException("Invalid ID format in destination or principal");
        }
    }

    private Authentication extractAuthentication(StompHeaderAccessor accessor) {
        // 1. SessionAttributes (HttpSessionHandshakeInterceptor)에서 SecurityContext 복구
        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        if (sessionAttributes != null) {
            Object secContextObj = sessionAttributes.get(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
            if (secContextObj instanceof SecurityContext securityContext && securityContext.getAuthentication() != null) {
                return securityContext.getAuthentication();
            }
        }

        // 2. 현재 스레드의 SecurityContextHolder 확인
        Authentication currentAuth = SecurityContextHolder.getContext().getAuthentication();
        if (currentAuth != null && currentAuth.isAuthenticated()) {
            return currentAuth;
        }

        return null;
    }
}
