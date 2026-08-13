CREATE TABLE users (
    uuid BINARY(16) NOT NULL,
    nickname VARCHAR(45) NOT NULL,
    password VARCHAR(255) NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    CONSTRAINT pk_users PRIMARY KEY (uuid),
    CONSTRAINT uk_users_nickname UNIQUE (nickname)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE social_connections (
    social_connection_id BIGINT NOT NULL AUTO_INCREMENT,
    uuid BINARY(16) NOT NULL,
    provider_type VARCHAR(45) NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_social_connections PRIMARY KEY (social_connection_id),
    CONSTRAINT uk_social_connections_provider UNIQUE (provider_type, provider_id),
    CONSTRAINT fk_social_connections_users
        FOREIGN KEY (uuid) REFERENCES users (uuid) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stages (
    stage_id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    difficulty VARCHAR(10) NOT NULL,
    thumbnail_url VARCHAR(255) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_stages PRIMARY KEY (stage_id),
    CONSTRAINT uk_stages_name UNIQUE (name)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stage_rounds (
    round_id INT NOT NULL,
    stage_id INT NOT NULL,
    round_no INT NOT NULL,
    map_config JSON NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_stage_rounds PRIMARY KEY (round_id),
    CONSTRAINT uk_stage_rounds_stage UNIQUE (stage_id, round_no),
    CONSTRAINT fk_stage_rounds_stages
        FOREIGN KEY (stage_id) REFERENCES stages (stage_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stage_records (
    stage_record_id BIGINT NOT NULL AUTO_INCREMENT,
    uuid BINARY(16) NOT NULL,
    stage_id INT NOT NULL,
    stage_play_time_ms BIGINT NOT NULL,
    is_clear TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_stage_records PRIMARY KEY (stage_record_id),
    CONSTRAINT fk_stage_records_users
        FOREIGN KEY (uuid) REFERENCES users (uuid),
    CONSTRAINT fk_stage_records_stages
        FOREIGN KEY (stage_id) REFERENCES stages (stage_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE round_records (
    stage_record_id BIGINT NOT NULL,
    round_id INT NOT NULL,
    round_play_time_ms BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT pk_round_records PRIMARY KEY (stage_record_id, round_id),
    CONSTRAINT fk_round_records_stage_records
        FOREIGN KEY (stage_record_id)
        REFERENCES stage_records (stage_record_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_round_records_stage_rounds
        FOREIGN KEY (round_id) REFERENCES stage_rounds (round_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;
