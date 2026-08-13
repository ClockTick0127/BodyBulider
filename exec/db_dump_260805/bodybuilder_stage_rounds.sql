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
-- Table structure for table `stage_rounds`
--

DROP TABLE IF EXISTS `stage_rounds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stage_rounds` (
  `round_id` int NOT NULL,
  `stage_id` int NOT NULL,
  `round_no` int NOT NULL,
  `map_config` json NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`round_id`),
  UNIQUE KEY `uk_stage_rounds_stage` (`stage_id`,`round_no`),
  CONSTRAINT `fk_stage_rounds_stages` FOREIGN KEY (`stage_id`) REFERENCES `stages` (`stage_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stage_rounds`
--

LOCK TABLES `stage_rounds` WRITE;
/*!40000 ALTER TABLE `stage_rounds` DISABLE KEYS */;
INSERT INTO `stage_rounds` VALUES (1,1,1,'{\"players\": [[270, 545], [460, 465], [625, 405], [770, 315]], \"terrain\": [[[0, 580], [180, 580], [180, 610], [0, 610]], [[835, 300], [1000, 300], [1000, 1000], [835, 1000]]], \"endPoint\": [895, 250], \"startPoint\": [105, 550]}','2026-07-28 13:26:02.238599','2026-07-31 09:25:35.941226'),(2,1,2,'{\"players\": [[180, 850], [360, 750], [600, 700], [750, 610]], \"terrain\": [[[0, 900], [100, 900], [100, 930], [0, 930]], [[420, 690], [560, 690], [560, 1000], [420, 1000]], [[820, 600], [1000, 600], [1000, 1000], [820, 1000]]], \"endPoint\": [910, 550], \"gimmicks\": [{\"type\": \"BLACKOUT\", \"delayMs\": 2000, \"durationMs\": 0}], \"startPoint\": [70, 900]}','2026-07-28 13:26:02.238599','2026-07-31 09:25:35.955045'),(3,1,3,'{\"players\": [[670, 430], [500, 465], [330, 500], [160, 535]], \"terrain\": [[[0, 105], [640, 105], [700, 170], [655, 225], [610, 175], [0, 175]], [[0, 925], [1000, 924], [1000, 1000], [0, 1000]]], \"endPoint\": [885, 850], \"gimmicks\": [{\"type\": \"WATER_PIPE\", \"inlet\": [500, 170], \"outlet\": [681.3, 194], \"flowSpeed\": 180, \"flowDirection\": [0, 1], \"shutdownOnBlocked\": true}], \"startPoint\": [100, 900]}','2026-07-28 13:26:02.238599','2026-08-04 10:09:45.530245'),(4,2,1,'{\"players\": [[385.1, 573.5], [578, 665], [783, 277], [786, 418]], \"terrain\": [[[0, 390], [180, 390], [180, 425], [0, 425]], [[700, 770], [1000, 770], [1000, 1000], [835, 1000]]], \"endPoint\": [900, 735], \"gimmicks\": [{\"area\": [50, 400, 900, 420], \"band\": [240.5, 463.9], \"type\": \"WIND\", \"force\": 150, \"strength\": 700, \"direction\": [1, 0]}], \"startPoint\": [95, 345]}','2026-07-28 13:26:02.238599','2026-08-03 21:35:24.347611'),(5,2,2,'{\"players\": [[165.8, 797.1], [300.7, 797.1], [587.1, 129.9], [707.7, 280.4]], \"terrain\": [[[0, 840.2], [81.2, 840.2], [81.2, 1000], [0, 1000]], [[825, 320], [995, 320], [995, 1000], [825, 1000]]], \"endPoint\": [986.1, 288.9], \"gimmicks\": [{\"size\": [130, 45], \"type\": \"JUMP_PAD\", \"position\": [495.3, 859.3], \"launchVelocity\": [-10, -1400]}, {\"area\": [0, 0, 1000, 40], \"type\": \"KILL_ZONE\"}], \"startPoint\": [36.1, 809.7]}','2026-07-28 13:26:02.238599','2026-08-04 16:36:41.984335'),(6,2,3,'{\"players\": [[285, 330], [455, 505], [625, 430], [785, 310]], \"terrain\": [[[0, 210], [150, 210], [150, 1000], [0, 1000]], [[820, 210], [1000, 210], [1000, 245], [820, 245]]], \"endPoint\": [900, 120], \"gimmicks\": [{\"type\": \"DISAPPEARING_PLAYERS\", \"delayMs\": 600, \"durationMs\": 0, \"intervalMs\": 450, \"playerIndices\": [1, 2, 3, 4]}], \"startPoint\": [70, 205]}','2026-08-03 14:07:52.939187','2026-08-03 14:07:52.939187');
/*!40000 ALTER TABLE `stage_rounds` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-05 10:15:36
