import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './config/db.js';
import authRouter from './routes/auth.js';
import exercisesRouter from './routes/exercises.js';
import progressRouter from './routes/progress.js';
import statsRouter from './routes/stats.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  credentials: true, // allow cookies for refresh token
}));
app.use(express.json());
app.use(cookieParser());
// Access to fetch at 'http://localhost:3000/api/auth/refresh' from origin 'https://warrant-label-costa-acceptable.trycloudflare.com' has been blocked by CORS policy: Permission was denied for this request to access the `loopback` address space.
// resolve CORS error when frontend is served from a different port (e.g. via Live Server) by allowing loopback in browser flags (e.g. chrome://flags/#allow-insecure-localhost)  



// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/exercises', exercisesRouter);
app.use('/api/progress', progressRouter);
app.use('/api/stats', statsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Error handler (must be last)
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
});
