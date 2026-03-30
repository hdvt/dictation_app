# Dictation Platform

A full-stack dictation learning platform. Users add YouTube videos, the backend auto-fetches transcripts, and users practice dictation with progress tracking.

## Stack

- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **Frontend**: Vanilla JS + HTML/CSS (no framework)
- **Auth**: JWT (access token in memory) + refresh token in httpOnly cookie
- **Transcript**: `youtube-transcript-plus` npm package

---

## Project Structure

```
dictation-platform/
├── backend/
│   ├── src/
│   │   ├── app.js                  ← Express entry point
│   │   ├── config/db.js            ← MongoDB connection
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Exercise.js
│   │   │   ├── Challenge.js
│   │   │   ├── UserProgress.js
│   │   │   └── ActivityLog.js
│   │   ├── routes/
│   │   │   ├── auth.js             ← /api/auth/*
│   │   │   ├── exercises.js        ← /api/exercises/*
│   │   │   ├── progress.js         ← /api/progress/*
│   │   │   └── stats.js            ← /api/stats/*
│   │   ├── services/
│   │   │   └── YouTubeTranscriptService.js
│   │   └── middleware/
│   │       ├── auth.js             ← JWT requireAuth
│   │       └── errorHandler.js
│   ├── package.json
│   └── .env
│
└── frontend/
    ├── index.html          ← Library (list of exercises)
    ├── exercise.html       ← Dictation exercise page
    ├── progress.html       ← Stats, heatmap, activity
    ├── login.html
    ├── register.html
    └── js/
        └── api.js          ← Shared API client + auth helpers
```

---

## Setup

### Prerequisites
- Node.js 18+
- MongoDB running locally on port 27017 (or MongoDB Atlas URI)

### 1. Backend

```bash
cd backend
npm install
```

Edit `.env` — set real secrets:
```
MONGODB_URI=mongodb://localhost:27017/dictation_platform
JWT_SECRET=your_long_random_secret_here
JWT_REFRESH_SECRET=another_long_random_secret_here
FRONTEND_URL=http://localhost:5500
```

Start the server:
```bash
npm run dev      # development (auto-restart)
npm start        # production
```

Server runs on `http://localhost:3000`

### 2. Frontend

Serve the `frontend/` folder with any static server. Using VS Code Live Server or:

```bash
cd frontend
npx serve .      # serves on http://localhost:3000 or similar
# OR
python3 -m http.server 5500
```

Open `http://localhost:5500` in your browser.

---

## API Reference

### Auth
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | `{ email, password, displayName }` | Create account |
| POST | `/api/auth/login` | `{ email, password }` | Login → returns accessToken |
| POST | `/api/auth/refresh` | — (cookie) | Refresh access token |
| POST | `/api/auth/logout` | — | Clear refresh cookie |
| GET | `/api/auth/me` | — | Get current user |
| PATCH | `/api/auth/me` | `{ displayName?, settings? }` | Update profile |
| PATCH | `/api/auth/me/password` | `{ currentPassword, newPassword }` | Change password |

### Exercises (all require Bearer token)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/exercises` | List user's exercises (with progress) |
| GET | `/api/exercises/:id` | Get exercise + challenges + progress |
| GET | `/api/exercises/:id/status` | Poll transcript status |
| POST | `/api/exercises` | Add exercise `{ youtubeUrl }` → triggers transcript fetch |
| PATCH | `/api/exercises/:id` | Update metadata |
| DELETE | `/api/exercises/:id` | Delete exercise + challenges + progress |
| POST | `/api/exercises/:id/retry-transcript` | Re-run failed transcript |

### Progress (all require Bearer token)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/progress` | All user progress entries |
| GET | `/api/progress/:exerciseId` | Progress for one exercise |
| POST | `/api/progress/:exerciseId/start` | Start/resume session |
| POST | `/api/progress/:exerciseId/pass` | Record passed challenge `{ challengeId, currentChallengeIndex }` |
| POST | `/api/progress/:exerciseId/complete` | Mark exercise complete |
| POST | `/api/progress/:exerciseId/reset` | Reset progress to zero |

### Stats (all require Bearer token)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats/me` | Overview stats + streak days |
| GET | `/api/stats/me/activity?from=&to=` | Daily activity for heatmap |
| GET | `/api/stats/me/exercises` | Top exercises by time + recent activity |

---

## Data Flow

### Adding a new exercise
```
1. User pastes YouTube URL
2. POST /api/exercises { youtubeUrl }
3. Backend extracts videoId, creates Exercise (status: pending)
4. Background: processTranscript() runs
   a. Fetch video metadata via oEmbed
   b. fetchTranscript(videoId) from youtube-transcript-plus
   c. Save Challenge documents
   d. Update Exercise.transcriptStatus = "ready"
5. Frontend polls GET /api/exercises/:id/status every 2s
6. When status = "ready" → card updates + toast shows
```

### Completing a challenge
```
1. User types correct answer → checkAnswer() matches
2. POST /api/progress/:exerciseId/pass { challengeId, currentChallengeIndex }
3. Server: $addToSet passedChallengeIds, $inc totalPassed, log to ActivityLog
4. Frontend: updates dots, progress bar, confetti
5. Auto-advance to next challenge
```

---

## Notes

- All exercises are **private per user** — users cannot see each other's exercises
- The transcript fetch runs **in the background** (fire and forget) — the frontend polls for status
- Access tokens expire in 15 minutes; refresh tokens last 30 days in httpOnly cookies
- The frontend's `api.js` handles token refresh transparently on 401 responses

## Todo
- improve dication UX/UI:
    + 