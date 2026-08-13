package org.ssafy.bodybuilder.domain.game.websocket.handler;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.ssafy.bodybuilder.common.error.GlobalException;
import org.ssafy.bodybuilder.common.response.ErrorCode;
import org.ssafy.bodybuilder.domain.game.message.GameMessage;
import org.ssafy.bodybuilder.domain.game.message.GameMessageType;
import org.ssafy.bodybuilder.domain.game.service.GameStartService;
import org.ssafy.bodybuilder.domain.game.message.payload.GameStartRequestPayload;

import java.security.Principal;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class GameStartMessageHandler
        implements GameMessageHandler<GameStartRequestPayload>{

    private final GameStartService gameStartService;

    @Override
    public GameMessageType type(){return GameMessageType.GAME_START_REQUEST;}

    @Override
    public Class<GameStartRequestPayload> payloadType(){
        return GameStartRequestPayload.class;
    }

    //handle로 message를 보낸다.
    @Override
    public void handle(
            GameMessage<GameStartRequestPayload> message,
            Principal principal
    ){

        UUID requesterId=resolveUserId(principal);


        gameStartService.startGame(
                message.roomSessionId(),
                requesterId,
                message.payload() == null ? null : message.payload().stageId()
        );
    }

    private UUID resolveUserId(Principal principal){
        //인증이 없으면 검증X
        if(principal == null){
            throw new GlobalException(ErrorCode.UNAUTHORIZED);
        }

        //UUID를 풀어서 return
        try{
            return UUID.fromString(principal.getName());
        }catch (IllegalArgumentException e){
            throw new GlobalException(ErrorCode.UNAUTHORIZED);
        }
    }
}
