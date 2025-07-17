import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JWTPayload, UserWithoutPassword } from '../types';
import pool from '../database/config';

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Access token required'
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as JWTPayload;
    
    // Get user from database
    const { rows } = await pool.query(
      'SELECT id, name, email, avatar, status, created_at, updated_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    const users = rows as UserWithoutPassword[];
    
    if (users.length === 0) {
      res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
      return;
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(403).json({
      success: false,
      error: 'Invalid token'
    });
  }
};

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'fallback_secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as JWTPayload;
}; 