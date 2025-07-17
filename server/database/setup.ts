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

    // Chats table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255),
        type VARCHAR(10) CHECK (type IN ('private', 'group')) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chat participants table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_participants (
        id VARCHAR(36) PRIMARY KEY,
        chat_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36) NOT NULL,
        role VARCHAR(10) CHECK (role IN ('admin', 'member')) DEFAULT 'member',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (chat_id, user_id)
      )
    `);

    // Messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(36) PRIMARY KEY,
        content TEXT NOT NULL,
        sender_id VARCHAR(36) NOT NULL,
        chat_id VARCHAR(36) NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        is_read_by_recipient BOOLEAN DEFAULT FALSE,
        deliveredTo JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
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

    console.log('Database tables created successfully');
    return;
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
};

export const dropTables = async (): Promise<void> => {
  try {
    await pool.query('DROP TABLE IF EXISTS password_reset_tokens CASCADE');
    await pool.query('DROP TABLE IF EXISTS messages CASCADE');
    await pool.query('DROP TABLE IF EXISTS chat_participants CASCADE');
    await pool.query('DROP TABLE IF EXISTS chats CASCADE');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');

    console.log('Database tables dropped successfully');
  } catch (error) {
    console.error('Error dropping tables:', error);
    throw error;
  }
};

export const resetDatabase = async (): Promise<void> => {
  try {
    await dropTables();
    await createTables();
    console.log('Database reset successfully');
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  }
};

createTables();