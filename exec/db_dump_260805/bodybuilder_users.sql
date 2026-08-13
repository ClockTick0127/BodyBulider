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
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `uuid` binary(16) NOT NULL,
  `nickname` varchar(45) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'USER',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`uuid`),
  UNIQUE KEY `uk_users_nickname` (`nickname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (_binary 'q\n\Z∏∞@\Z¢=QC\Ë5E','ÎÇòÏó¨Î∞±ÏÑ±Ïàò','$2a$10$E1Liysl9RIRv0lNYcaFYVedyc/rEVzRI03vdWY5B/spN8QK2aDsDW','USER','2026-07-31 12:42:25.714941','2026-07-31 12:42:25.714941',NULL),(_binary 'AÅ','Í∑ºÏú°Îß®','$2a$10$GsmBlcHJumm6ymtSVJj7.eCihmSHJYQ1nj6jWUpMQYPx2hhq9sBG2','USER','2026-07-28 13:26:02.209248','2026-07-28 17:47:51.513764',NULL),(_binary '\◊U9\"@\„á+äDÇ','Î∂ÄÏ†ïÎ∂ÄÏ†ïÎ∂ÄÏ†ïÎß•','$2a$10$CQGmzXCn6W2wtc9vOJ.qROrt8q1X/skM7/PVqzG8tGHIGFEcwtx4K','USER','2026-07-29 16:19:32.588563','2026-07-29 16:19:32.588563',NULL),(_binary '\Z\ÍS ®L_π3ìàâc#\‡','abcd','$2a$10$XLnDrGGecl1JHGHZWbL8DuLoiyUnLd73Q1jeEd.tKIQBQ/lTCjuCi','USER','2026-07-28 17:17:31.380115','2026-07-28 17:17:31.380115',NULL),(_binary '!\„∫c\◊˛G+∂é$Û˚ï®¢','qwer','$2a$10$hF77Gm1Q9.OB3z4iWN8e0OX90laFft88Nl7yZpFzV20kGDZ0UsiJi','USER','2026-07-30 14:54:29.849869','2026-07-30 14:54:29.849869',NULL),(_binary '\"\"\"\"\"\"B\"Ç\"\"\"\"\"\"\"','Ìó¨Ï∞Ω2Ìò∏','$2a$10$GsmBlcHJumm6ymtSVJj7.eCihmSHJYQ1nj6jWUpMQYPx2hhq9sBG2','USER','2026-07-28 13:26:02.209248','2026-07-28 17:47:51.513764',NULL),(_binary '333333C3É3333333','Í¥ÄÎ¶¨Ïûê','$2a$10$GsmBlcHJumm6ymtSVJj7.eCihmSHJYQ1nj6jWUpMQYPx2hhq9sBG2','ADMIN','2026-07-28 13:26:02.209248','2026-07-28 17:47:51.513764',NULL),(_binary '=è\ÿƒöGùªy\'îÄGKC','ÏÇ∞Í≥®ÎùºÏù¥Îçî','$2a$10$7KmnnyASPYbSlg97Kv2z3O0Ep5kevUi7Fp9GiceS61XdNo7jBsgTq','USER','2026-07-28 17:52:54.165192','2026-07-28 17:52:54.165192',NULL),(_binary '?äelBG±G|uUK\”˝','ÌïòÏù¥','$2a$10$zpsIrRAGqvexmmPSdoEi.ObNuSONrXIc7CkCYDJuKkXtkb1SheqmG','USER','2026-07-30 14:57:38.040201','2026-07-30 14:57:38.040201',NULL),(_binary 'O\Ï^˛s%J∑´2í\ËèmÒñ','ÎÇòÏó¨Ïù¥ÏßÑÏö±','$2a$10$tIbIA5jtKYy8IDhZoe0c6u4PXeOwczwjQtPbpq.tq./I8oYyjXc3u','USER','2026-07-28 17:46:30.860367','2026-07-28 17:52:27.784970',NULL),(_binary '_—åLºL-™\'@,+®ú','zxcv','$2a$10$.FL6eNDWxqzOS19tmKDpfuW8Zyo1RJ.OsVuQSG7olFRN8.NsunQIW','USER','2026-07-30 17:17:47.022374','2026-07-30 17:17:47.022374',NULL),(_binary 'g∫f|≤L™ª∑Å∞ö\‰ˇn','ÎãâÎÑ§ÏûÑ','$2a$10$XT0owyCeeDtJfVh9qiL/EuyTebjlpQuo14gp8HHSkWyjCHVMGhzE2','USER','2026-08-01 01:18:36.766931','2026-08-01 01:18:36.766931',NULL),(_binary 'åŒî\Ó\"O&Äpk	ΩÇ','qqqqqq','$2a$10$eR0wacCwVJNX85lgqmP35eXrbp6KBOm6pjYMSiGyqnPnPrzo6FhmW','USER','2026-07-31 15:04:47.857282','2026-07-31 15:04:47.857282',NULL),(_binary '≥\∆–ä\Ìj@õ±r\–8≥yÅ4','Ìò∏ÎûëÏù¥','$2a$10$Iklcfi8ASKPGhIzDEDJApe4aVMpgx.xe.H9jYfoOPpNaU9Y4Alj/q','USER','2026-07-31 15:04:25.203252','2026-07-31 15:04:25.203252',NULL),(_binary '¥ÇfœÖ\‚D›É}\‹#\»DT','1234','$2a$10$ksULsGsCizM4Un1I9EMaeeSizbN.I7vYuK4oJdVxYZZPUvF37TjOy','USER','2026-07-31 10:44:55.534211','2026-07-31 10:44:55.534211',NULL),(_binary 'Ωï\ÂæbëHló\”*oÅLm','ÏÇ¨Ïö©Ïûê','$2a$10$NMH3VHBOrceRIUPIWu1F8OB2zSNRsptBTKyxyMn7wMD8EcJalDqFm','USER','2026-08-05 10:06:44.903042','2026-08-05 10:06:44.903042',NULL),(_binary '¬ª++f]Cíä4)§|™V','BÍ∏â152ÏúÑÏÇ∞Í≥®ÎùºÏù¥Îçî','$2a$10$jSC7lNrmm4Yt2puusg/uwup1m21uSppkcp9fg.P89Zltzu7AC94mW','USER','2026-07-28 17:53:35.113894','2026-07-28 17:53:35.113894',NULL),(_binary '\ƒ%ı^\Ÿ\ﬂN\‚äqì≤/(','tester123','$2a$10$cy/rTVFFaCLhB5TrQ5s7B.BGvhcDoYLMzmFXkwsdmdff9etgXUFeC','USER','2026-07-31 10:50:39.996218','2026-07-31 10:50:39.996218',NULL),(_binary '…∂0Wµ\·I‹ªT\‚\€∂?','456','$2a$10$UpEI0VkqCyJ.Gx3ltBt7QO1tIU3bwBGBN6MNyRHL47kBVM9pDJW5K','USER','2026-07-28 17:21:45.576779','2026-07-28 17:21:45.576779',NULL),(_binary '\œ[˜´\ÿwK˛ô†\"ú\„¿\ÈT','abc','$2a$10$kavGh.CvLouUPPNs5r0xy.jzROXEUowo.F0HvokcHx80YudJQlPla','USER','2026-07-28 14:33:34.829832','2026-07-28 14:33:34.829832',NULL),(_binary '\◊\Ã\Â¸˝N∑B\ÍJ\Ì˚¶\”','asdf','$2a$10$oCBMATHGUa7UHoIvyhv/gOLaAbcgYNRoYbx05LxmsI8h1xYfh01l2','USER','2026-07-31 10:45:08.180444','2026-07-31 10:45:08.180444',NULL),(_binary '\€ﬂ¨6ßBîo…á=jf8','c0127','$2a$10$HSQ1EASuD8uWTj/fEoo5fOI3T3u95Ch8Cq7jPo1Wft3JsNeqwoeZy','USER','2026-07-28 17:47:14.462622','2026-07-28 17:47:14.462622',NULL),(_binary '˚\«*§@Bí{ \‚ªÙ','Ï†ïÏÉÅÌôî','$2a$10$pNIguTXcLRxk4bAkmAMk9OGIZxRwmUGY5AUEe54076FqPJqUE8Ob6','USER','2026-07-28 15:44:26.450649','2026-07-28 15:44:26.450649',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
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
