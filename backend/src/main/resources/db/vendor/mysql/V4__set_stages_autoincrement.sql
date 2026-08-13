-- 커스텀 맵 예약 대역: 공식 스테이지는 stage_id < 10000, 유저 맵은 >= 10000
ALTER TABLE stages AUTO_INCREMENT = 10000;
