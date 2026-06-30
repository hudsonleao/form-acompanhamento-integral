CREATE DATABASE IF NOT EXISTS acompanhamento_integral
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE acompanhamento_integral;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_users_email (email)
);

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  class_name VARCHAR(80) NOT NULL,
  teacher_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_students_name (name),
  INDEX idx_students_class (class_name)
);

CREATE TABLE IF NOT EXISTS assessments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  assessment_date DATE NOT NULL,
  period_label VARCHAR(80) NOT NULL,
  teacher_name VARCHAR(120) NOT NULL,
  strengths TEXT NULL,
  development_points TEXT NULL,
  pedagogical_actions TEXT NULL,
  family_alignment TEXT NULL,
  evidence_photos JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_assessments_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON DELETE CASCADE,
  INDEX idx_assessments_student_date (student_id, assessment_date),
  INDEX idx_assessments_date (assessment_date)
);

CREATE TABLE IF NOT EXISTS responses (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assessment_id INT UNSIGNED NOT NULL,
  aspect_key ENUM('volitivo', 'afetivo', 'cognitivo') NOT NULL,
  indicator_id VARCHAR(80) NOT NULL,
  indicator_text VARCHAR(280) NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  observation TEXT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_responses_assessment
    FOREIGN KEY (assessment_id) REFERENCES assessments (id)
    ON DELETE CASCADE,
  UNIQUE KEY uniq_response_indicator (assessment_id, indicator_id),
  INDEX idx_responses_aspect (aspect_key),
  INDEX idx_responses_rating (rating)
);
