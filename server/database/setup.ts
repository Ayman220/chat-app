import { DatabaseConfig } from '@/types';
import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

// Load environment variables from root directory
dotenv.config({ path: path.join(__dirname, '../.env') });
const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'chat_app'
};

const pool = new Pool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const createTables = async (): Promise<void> => {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        avatar VARCHAR(500),
        status VARCHAR(100) DEFAULT 'online',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Direct chats table (for 1-on-1 conversations)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS direct_chats (
        id VARCHAR(36) PRIMARY KEY,
        user1_id VARCHAR(36) NOT NULL,
        user2_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user1_id, user2_id),
        CHECK (user1_id != user2_id)
      )
    `);

    // Group chats table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_chats (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        avatar VARCHAR(500),
        created_by VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Group chat participants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_chat_participants (
        id VARCHAR(36) PRIMARY KEY,
        group_chat_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        role VARCHAR(10) CHECK (role IN ('admin', 'member')) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_chat_id) REFERENCES group_chats(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (group_chat_id, user_id)
      )
    `);

    // Direct messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS direct_messages (
        id VARCHAR(36) PRIMARY KEY,
        content TEXT NOT NULL,
        sender_id VARCHAR(36) NOT NULL,
        direct_chat_id VARCHAR(36) NOT NULL,
        delivered BOOLEAN DEFAULT FALSE,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (direct_chat_id) REFERENCES direct_chats(id) ON DELETE CASCADE
      )
    `);

    // Group messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id VARCHAR(36) PRIMARY KEY,
        content TEXT NOT NULL,
        sender_id VARCHAR(36) NOT NULL,
        group_chat_id VARCHAR(36) NOT NULL,
        read_by JSONB DEFAULT '[]'::jsonb,
        delivered_to JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_chat_id) REFERENCES group_chats(id) ON DELETE CASCADE
      )
    `);

    // Password reset tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    return;
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
};

export const dropTables = async (): Promise<void> => {
  try {
    await pool.query('DROP TABLE IF EXISTS password_reset_tokens CASCADE');
    await pool.query('DROP TABLE IF EXISTS group_messages CASCADE');
    await pool.query('DROP TABLE IF EXISTS direct_messages CASCADE');
    await pool.query('DROP TABLE IF EXISTS group_chat_participants CASCADE');
    await pool.query('DROP TABLE IF EXISTS group_chats CASCADE');
    await pool.query('DROP TABLE IF EXISTS direct_chats CASCADE');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');

  } catch (error) {
    console.error('Error dropping tables:', error);
    throw error;
  }
};

export const resetDatabase = async (): Promise<void> => {
  try {
    await dropTables();
    await createTables();
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  }
};

createTables();