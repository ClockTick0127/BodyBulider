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
-- Table structure for table `round_records`
--

DROP TABLE IF EXISTS `round_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `round_records` (
  `stage_record_id` bigint NOT NULL,
  `round_id` int NOT NULL,
  `round_play_time_ms` bigint NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`stage_record_id`,`round_id`),
  KEY `fk_round_records_stage_rounds` (`round_id`),
  CONSTRAINT `fk_round_records_stage_records` FOREIGN KEY (`stage_record_id`) REFERENCES `stage_records` (`stage_record_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_round_records_stage_rounds` FOREIGN KEY (`round_id`) REFERENCES `stage_rounds` (`round_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `round_records`
--

LOCK TABLES `round_records` WRITE;
/*!40000 ALTER TABLE `round_records` DISABLE KEYS */;
INSERT INTO `round_records` VALUES (1,1,28000,'2026-07-28 13:26:02.268102'),(1,2,31000,'2026-07-28 13:26:02.268102'),(1,3,36000,'2026-07-28 13:26:02.268102'),(2,1,30000,'2026-07-28 13:26:02.282749'),(2,2,34500,'2026-07-28 13:26:02.282749'),(2,3,38000,'2026-07-28 13:26:02.282749'),(3,4,35000,'2026-07-28 13:26:02.296964'),(3,5,43000,'2026-07-28 13:26:02.296964'),(4,4,65000,'2026-07-28 13:26:02.310931');
/*!40000 ALTER TABLE `round_records` ENABLE KEYS */;
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
