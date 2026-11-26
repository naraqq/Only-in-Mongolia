-- Development only (compose.dev.yaml): a separate database for the test suite, so tests never touch your dev data.
CREATE DATABASE IF NOT EXISTS only_in_mongolia_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON only_in_mongolia_test.* TO 'only_in_mongolia'@'%';
FLUSH PRIVILEGES;
