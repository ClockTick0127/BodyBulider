CREATE TABLE game_sessions (
    game_session_id BINARY(16) NOT NULL,
    room_session_id BINARY(16) NOT NULL,
    room_code VARCHAR(10) NOT NULL,
    room_title VARCHAR(100) NOT NULL,
    stage_id INT NOT NULL,
    final_status VARCHAR(20) NOT NULL,
    game_result VARCHAR(20) NULL,
    started_at DATETIME(6) NOT NULL,
    ended_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_game_sessions PRIMARY KEY (game_session_id),
    INDEX idx_game_sessions_room_ended (room_session_id, ended_at),
    INDEX idx_game_sessions_status_ended (final_status, ended_at),
    INDEX idx_game_sessions_ended (ended_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE error_details (
    error_id BINARY(16) NOT NULL,
    source VARCHAR(20) NOT NULL,
    severity VARCHAR(10) NOT NULL,
    error_code VARCHAR(20) NULL,
    exception_class VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    stack_trace TEXT NULL,
    room_session_id BINARY(16) NULL,
    game_session_id BINARY(16) NULL,
    user_uuid BINARY(16) NULL,
    request_id VARCHAR(64) NULL,
    trace_id VARCHAR(64) NULL,
    event_id BINARY(16) NULL,
    context JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at DATETIME(6) NOT NULL,
    CONSTRAINT pk_error_details PRIMARY KEY (error_id),
    INDEX idx_error_details_room_created (room_session_id, created_at),
    INDEX idx_error_details_game_created (game_session_id, created_at),
    INDEX idx_error_details_source_severity_created (source, severity, created_at),
    INDEX idx_error_details_expires_at (expires_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE session_events (
    session_event_id BIGINT NOT NULL AUTO_INCREMENT,
    game_session_id BINARY(16) NOT NULL,
    sequence_no BIGINT NOT NULL,
    event_id BINARY(16) NOT NULL,
    event_type VARCHAR(45) NOT NULL,
    message_type VARCHAR(45) NULL,
    severity VARCHAR(10) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    result VARCHAR(20) NOT NULL,
    actor_uuid BINARY(16) NULL,
    summary JSON NOT NULL,
    payload_size_bytes BIGINT NULL,
    duration_ms BIGINT NULL,
    error_id BINARY(16) NULL,
    occurred_at DATETIME(6) NOT NULL,
    server_received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    schema_version SMALLINT NOT NULL DEFAULT 1,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_session_events PRIMARY KEY (session_event_id),
    CONSTRAINT uk_session_events_event_id UNIQUE (event_id),
    CONSTRAINT uk_session_events_session_sequence UNIQUE (game_session_id, sequence_no),
    CONSTRAINT fk_session_events_game_sessions
        FOREIGN KEY (game_session_id)
        REFERENCES game_sessions (game_session_id)
        ON DELETE CASCADE,
    INDEX idx_session_events_session_received (game_session_id, server_received_at),
    INDEX idx_session_events_type_received (event_type, server_received_at),
    INDEX idx_session_events_error_id (error_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE game_round_replays (
    round_replay_id BIGINT NOT NULL AUTO_INCREMENT,
    game_session_id BINARY(16) NOT NULL,
    round_no INT NOT NULL,
    poses JSON NOT NULL,
    simulation JSON NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_game_round_replays PRIMARY KEY (round_replay_id),
    CONSTRAINT uk_game_round_replays_session_round
        UNIQUE (game_session_id, round_no),
    CONSTRAINT fk_game_round_replays_game_sessions
        FOREIGN KEY (game_session_id)
        REFERENCES game_sessions (game_session_id)
        ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;
