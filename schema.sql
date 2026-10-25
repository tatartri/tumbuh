-- ============================================================================
-- SKEMA DATABASE MYSQL UNTUK APLIKASI TUMBUH
-- Database: tumbuh_db
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `tumbuh_db`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `tumbuh_db`;

-- Matikan foreign key checks sementara untuk reset aman jika diperlukan
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `learning_contents`;
DROP TABLE IF EXISTS `reflections`;
DROP TABLE IF EXISTS `focus_sessions`;
DROP TABLE IF EXISTS `plant_progress`;
DROP TABLE IF EXISTS `users`;
SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- 1. TABEL: users
-- Menyimpan data identitas akun pengguna dan administrator
-- ----------------------------------------------------------------------------
CREATE TABLE `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nama` VARCHAR(100) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `status` ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  `avatar` VARCHAR(50) NOT NULL DEFAULT '🌱',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_users_email` (`email`),
  KEY `idx_users_role_status` (`role`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. TABEL: focus_sessions
-- Menyimpan riwayat setiap sesi fokus belajar
-- ----------------------------------------------------------------------------
CREATE TABLE `focus_sessions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `target_belajar` VARCHAR(255) NOT NULL,
  `durasi_detik` INT UNSIGNED NOT NULL,
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  `status` ENUM('running', 'completed', 'cancelled') NOT NULL DEFAULT 'running',
  PRIMARY KEY (`id`),
  KEY `idx_focus_user_status` (`user_id`, `status`),
  KEY `idx_focus_started` (`started_at`),
  CONSTRAINT `fk_focus_sessions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. TABEL: reflections
-- Menyimpan jurnal refleksi setelah sesi fokus
-- ----------------------------------------------------------------------------
CREATE TABLE `reflections` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `focus_session_id` INT UNSIGNED NULL DEFAULT NULL,
  `target_belajar` VARCHAR(255) NULL,
  `pemicu_distraksi` JSON NOT NULL,
  `perasaan` VARCHAR(50) NOT NULL,
  `hal_baru` TEXT NULL,
  `strategi` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reflections_user_created` (`user_id`, `created_at`),
  KEY `idx_reflections_session` (`focus_session_id`),
  CONSTRAINT `fk_reflections_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_reflections_session`
    FOREIGN KEY (`focus_session_id`) REFERENCES `focus_sessions` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. TABEL: plant_progress
-- Menyimpan status agregat pertumbuhan kebun pengguna (1 baris per user)
-- ----------------------------------------------------------------------------
CREATE TABLE `plant_progress` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `total_sesi` INT UNSIGNED NOT NULL DEFAULT 0,
  `total_durasi` INT UNSIGNED NOT NULL DEFAULT 0, -- Dalam satuan menit
  `level_tanaman` TINYINT UNSIGNED NOT NULL DEFAULT 1, -- 1: Benih, 2: Tunas, 3: Tanaman Muda, 4: Berbunga, 5: Pohon Dewasa
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_plant_user_unique` (`user_id`),
  CONSTRAINT `fk_plant_progress_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. TABEL: learning_contents
-- Menyimpan tips, panduan, dan materi belajar dari admin untuk anak-anak
-- ----------------------------------------------------------------------------
CREATE TABLE `learning_contents` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `judul` VARCHAR(200) NOT NULL,
  `isi` TEXT NOT NULL,
  `tipe` ENUM('guide', 'tip', 'quote', 'announcement') NOT NULL DEFAULT 'tip',
  `status` ENUM('published', 'draft', 'archived') NOT NULL DEFAULT 'published',
  `created_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_contents_type_status` (`tipe`, `status`),
  CONSTRAINT `fk_learning_contents_author`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DATA BENIH AWAL (SEEDS)
-- Password Admin: Admin123! (hash bcrypt salt rounds 10)
-- Password User Demo: Tumbuh123! (hash bcrypt salt rounds 10)
-- ============================================================================

INSERT INTO `users` (`id`, `nama`, `email`, `password_hash`, `role`, `status`, `avatar`) VALUES
(1, 'Admin TUMBUH', 'admin@tumbuh.id', '$2a$10$lT1hTpoMDap9aU2OKTFiTOHQwd4bsubFhUldA5gFcy9Jgq6mOSVl2', 'admin', 'active', '🌟'),
(2, 'Budi Pembelajar', 'anak@tumbuh.id', '$2a$10$KdUH/i4klIWhIooFS/k9j.Qbtq1zvbVz6L6VOb2oqfWEAARgH5Px6', 'user', 'active', '🌱');

INSERT INTO `plant_progress` (`user_id`, `total_sesi`, `total_durasi`, `level_tanaman`) VALUES
(1, 0, 0, 1),
(2, 2, 30, 2);

INSERT INTO `learning_contents` (`judul`, `isi`, `tipe`, `status`, `created_by`) VALUES
('Meja Bersih, Pikiran Bersih', 'Siapkan hanya buku, pensil, dan alat yang dibutuhkan sekarang. Simpan mainan atau gadget agar matamu tidak teralihkan.', 'tip', 'published', 1),
('Metode Pomodoro Ramah Anak', 'Belajar fokus selama 15-25 menit, lalu lakukan jeda istirahat aktif 5 menit agar otak tidak kelelahan.', 'tip', 'published', 1),
('Trik 3 Detik Melawan Lamunan', 'Tarik napas 3 kali dalam-dalam, hembuskan, lalu katakan: Aku bisa fokus sebentar lagi!', 'tip', 'published', 1),
('Pesan Pohon Sahabat', 'Pohon besar yang rindang dulunya hanyalah sebuah benih kecil yang tidak pernah menyerah untuk tumbuh.', 'quote', 'published', 1),
('Petunjuk Menanam di TUMBUH', 'Tentukan targetmu, mulai timer fokus, lalu isi refleksi setelah selesai untuk menyiram kebunmu.', 'guide', 'published', 1);
