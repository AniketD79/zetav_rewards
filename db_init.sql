-- Create Database
CREATE DATABASE IF NOT EXISTS zeta_rewards;
USE zeta_rewards;

-- ==============================================
-- USERS
-- ==============================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    password VARCHAR(255),
    role ENUM('admin', 'manager', 'employee') DEFAULT 'employee',
    manager_id INT,
    approved BOOLEAN DEFAULT FALSE,
    profile_picture VARCHAR(255),
    contact_info TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ==============================================
-- REWARD POINTS (manager -> employee)
-- ==============================================
CREATE TABLE reward_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    giver_id INT,
    receiver_id INT,
    points INT,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (giver_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);

-- ==============================================
-- MANAGER POINT ALLOCATION (admin -> manager)
-- ==============================================
CREATE TABLE manager_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    manager_id INT,
    points_assigned INT,
    remaining_points INT,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (manager_id) REFERENCES users(id)
);

-- ==============================================
-- REWARD REDEMPTIONS
-- ==============================================
CREATE TABLE redemptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    reward_title VARCHAR(100),
    required_points INT,
    status ENUM('pending', 'approved', 'declined') DEFAULT 'pending',
    decline_reason TEXT,
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==============================================
-- RECOGNITION FEED POSTS (created when manager gives reward)
-- ==============================================
CREATE TABLE posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    giver_id INT,
    receiver_id INT,
    points INT,
    reason TEXT,
    image_url VARCHAR(255), -- for uploaded post image
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (giver_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
);

-- ==============================================
-- COMMENTS ON POSTS
-- ==============================================
CREATE TABLE comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT,
    user_id INT,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==============================================
-- LIKES ON POSTS
-- ==============================================
CREATE TABLE likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT,
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unq_like (post_id, user_id), -- one like per user per post
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==============================================
-- LIKES ON COMMENTS (optional)
-- ==============================================
CREATE TABLE comment_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    comment_id INT,
    user_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unq_comment_like (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ==============================================
-- PUSH NOTIFICATIONS (Optional Used in App View)
-- ==============================================
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT,
    recipient_id INT,
    message TEXT,
    type VARCHAR(50), -- e.g. 'point_award', 'redemption_update', 'announcement'
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (recipient_id) REFERENCES users(id)
);

-- ==============================================
-- AUDIT LOGS (Every important action is logged)
-- ==============================================
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role ENUM('admin', 'manager', 'employee') NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
