CREATE DATABASE  IF NOT EXISTS `bodybuilder` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `bodybuilder`;
-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: bodybuilder
-- ------------------------------------------------------
-- Server version	8.4.10

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `session_events`
--

DROP TABLE IF EXISTS `session_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `session_events` (
  `session_event_id` bigint NOT NULL AUTO_INCREMENT,
  `game_session_id` binary(16) NOT NULL,
  `sequence_no` bigint NOT NULL,
  `event_id` binary(16) NOT NULL,
  `event_type` varchar(45) NOT NULL,
  `message_type` varchar(45) DEFAULT NULL,
  `severity` varchar(10) NOT NULL,
  `direction` varchar(20) NOT NULL,
  `result` varchar(20) NOT NULL,
  `actor_uuid` binary(16) DEFAULT NULL,
  `summary` json NOT NULL,
  `payload_size_bytes` bigint DEFAULT NULL,
  `duration_ms` bigint DEFAULT NULL,
  `error_id` binary(16) DEFAULT NULL,
  `occurred_at` datetime(6) NOT NULL,
  `server_received_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `schema_version` smallint NOT NULL DEFAULT '1',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`session_event_id`),
  UNIQUE KEY `uk_session_events_event_id` (`event_id`),
  UNIQUE KEY `uk_session_events_session_sequence` (`game_session_id`,`sequence_no`),
  KEY `idx_session_events_session_received` (`game_session_id`,`server_received_at`),
  KEY `idx_session_events_type_received` (`event_type`,`server_received_at`),
  KEY `idx_session_events_error_id` (`error_id`),
  CONSTRAINT `fk_session_events_game_sessions` FOREIGN KEY (`game_session_id`) REFERENCES `game_sessions` (`game_session_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `session_events`
--

LOCK TABLES `session_events` WRITE;
/*!40000 ALTER TABLE `session_events` DISABLE KEYS */;
/*!40000 ALTER TABLE `session_events` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-05 10:15:35
