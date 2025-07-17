# Deployment Guide

This guide will help you deploy the chat application to Render (backend) and Vercel (frontend).

## 🚀 Backend Deployment (Render)

### 1. Prepare Your Backend

1. **Database Setup**
   - Create a PostgreSQL database on Render or use an external service like Supabase
   - Get your database connection string

2. **Environment Variables**
   Create a `.env` file in the root directory with:
   ```env
   NODE_ENV=production
   PORT=10000
   DATABASE_URL=your_postgresql_connection_string
   JWT_SECRET=your_super_secret_jwt_key
   JWT_EXPIRES_IN=7d
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_password
   UPLOAD_PATH=./uploads
   MAX_FILE_SIZE=10485760
   CLIENT_URL=https://your-vercel-frontend-url.vercel.app
   ```

### 2. Deploy to Render

1. **Connect Repository**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Web Service"
   - Connect your GitHub repository

2. **Configure Service**
   - **Name**: `chat-app-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Root Directory**: Leave empty (or `server` if you want to deploy only the server folder)

3. **Environment Variables**
   Add all the environment variables from your `.env` file in the Render dashboard

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete
   - Note your backend URL (e.g., `https://your-app.onrender.com`)

## 🌐 Frontend Deployment (Vercel)

### 1. Prepare Your Frontend

1. **Environment Variables**
   Create a `.env` file in the `client` directory:
   ```env
   REACT_APP_API_URL=https://your-render-backend-url.onrender.com
   REACT_APP_SOCKET_URL=https://your-render-backend-url.onrender.com
   REACT_APP_ENV=production
   ```

2. **Update Configuration**
   - Replace the placeholder URLs in `client/src/config/api.js` with your actual Render backend URL

### 2. Deploy to Vercel

1. **Connect Repository**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository

2. **Configure Project**
   - **Framework Preset**: `Create React App`
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`

3. **Environment Variables**
   Add the environment variables in Vercel dashboard:
   - `REACT_APP_API_URL`
   - `REACT_APP_SOCKET_URL`
   - `REACT_APP_ENV`

4. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete
   - Note your frontend URL (e.g., `https://your-app.vercel.app`)

## 🔧 Post-Deployment Setup

### 1. Update Backend CORS

After getting your Vercel frontend URL, update the `CLIENT_URL` environment variable in Render to point to your Vercel deployment.

### 2. Database Setup

Run the database setup script:
```bash
# Locally (if you have access to the database)
npm run setup-db

# Or manually run the SQL scripts in your database
```

### 3. Test the Application

1. Visit your Vercel frontend URL
2. Register a new account
3. Test the chat functionality
4. Verify real-time features work

## 🔍 Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure `CLIENT_URL` in backend matches your Vercel URL exactly
   - Check that the URL includes the protocol (https://)

2. **Socket.IO Connection Issues**
   - Verify `REACT_APP_SOCKET_URL` points to your Render backend
   - Check that WebSocket connections are allowed

3. **Database Connection**
   - Verify your `DATABASE_URL` is correct
   - Ensure the database is accessible from Render

4. **File Upload Issues**
   - Render has ephemeral storage, so uploaded files will be lost on restart
   - Consider using AWS S3 or similar for file storage

### Environment Variables Checklist

**Backend (Render):**
- [ ] `DATABASE_URL`
- [ ] `JWT_SECRET`
- [ ] `CLIENT_URL` (your Vercel URL)
- [ ] `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS` (for password reset)

**Frontend (Vercel):**
- [ ] `REACT_APP_API_URL` (your Render backend URL)
- [ ] `REACT_APP_SOCKET_URL` (your Render backend URL)

## 📝 Notes

- **File Storage**: Render's file system is ephemeral. For production, use cloud storage (AWS S3, Cloudinary, etc.)
- **Database**: Consider using a managed PostgreSQL service for better reliability
- **SSL**: Both Render and Vercel provide SSL certificates automatically
- **Custom Domain**: You can add custom domains to both services

## 🔄 Updates

To update your deployment:
1. Push changes to your GitHub repository
2. Both Render and Vercel will automatically redeploy
3. Monitor the deployment logs for any issues 