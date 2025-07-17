import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import pool from '../database/config';
import { generateToken } from '../middleware/auth';
import { User, UserWithoutPassword, ApiResponse } from '../types';

const router = Router();

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Register
router.post('/register', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      } as ApiResponse);
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      } as ApiResponse);
    }

    // Check if user already exists
    const { rows: existingUsers } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      } as ApiResponse);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const userId = uuidv4();
    await pool.query(
      'INSERT INTO users (id, name, email, password) VALUES ($1, $2, $3, $4)',
      [userId, name, email, hashedPassword]
    );

    // Get created user
    const { rows: users } = await pool.query(
      'SELECT id, name, email, avatar, status, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    const user = users[0] as UserWithoutPassword;
    const token = generateToken({ userId: user.id, email: user.email });

    return res.status(201).json({
      success: true,
      data: { user, token }
    } as ApiResponse<{ user: UserWithoutPassword; token: string }>);
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({
      success: false,
      error: 'Registration failed'
    } as ApiResponse);
  }
});

// Login
router.post('/login', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      } as ApiResponse);
    }

    // Get user
    const { rows: users } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = users[0] as User;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as ApiResponse);
    }

    if (!user.password) {
      return res.status(401).json({
        success: false,
        error: 'User account not properly set up'
      } as ApiResponse);
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      } as ApiResponse);
    }

    // Generate token
    const token = generateToken({ userId: user.id, email: user.email });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return res.json({
      success: true,
      data: { user: userWithoutPassword, token }
    } as ApiResponse<{ user: UserWithoutPassword; token: string }>);
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed'
    } as ApiResponse);
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response): Promise<Response> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      } as ApiResponse);
    }

    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as { userId: string; email: string };

    try {
      const { rows: users } = await pool.query(
        'SELECT id, name, email, avatar, status, created_at, updated_at FROM users WHERE id = $1',
        [decoded.userId]
      );

      const user = users[0] as UserWithoutPassword;

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        } as ApiResponse);
      }

      return res.json({
        success: true,
        data: user
      } as ApiResponse<UserWithoutPassword>);
    } catch (dbError: any) {
      throw dbError;
    }
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user'
    } as ApiResponse);
  }
});

// Forgot password
router.post('/forgot-password', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      } as ApiResponse);
    }

    // Check if user exists
    const { rows: users } = await pool.query(
      'SELECT id, name FROM users WHERE email = $1',
      [email]
    );

    const user = users[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      } as ApiResponse);
    }

    // Generate reset token
    const resetToken = uuidv4();
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    // Save reset token
    await pool.query(
      'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)',
      [uuidv4(), user.id, resetToken, expiresAt]
    );

    // Send email
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset Request</h1>
        <p>Hello ${user.name},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    };

    await transporter.sendMail(mailOptions);

    return res.json({
      success: true,
      message: 'Password reset email sent'
    } as ApiResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send reset email'
    } as ApiResponse);
  }
});

// Reset password
router.post('/reset-password', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and password are required'
      } as ApiResponse);
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      } as ApiResponse);
    }

    // Check if token exists and is valid
    const { rows: tokens } = await pool.query(
      'SELECT user_id, expires_at FROM password_reset_tokens WHERE token = $1',
      [token]
    );

    const resetToken = tokens[0];

    if (!resetToken) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reset token'
      } as ApiResponse);
    }

    if (new Date() > new Date(resetToken.expires_at)) {
      return res.status(400).json({
        success: false,
        error: 'Reset token has expired'
      } as ApiResponse);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, resetToken.user_id]
    );

    // Delete used token
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE token = $1',
      [token]
    );

    return res.json({
      success: true,
      message: 'Password reset successful'
    } as ApiResponse);
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      error: 'Password reset failed'
    } as ApiResponse);
  }
});

export default router; 