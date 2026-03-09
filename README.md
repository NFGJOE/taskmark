# TaskMark 📚

AI-powered homework tracker, grade logger, and study assistant for students.

## Features
- 📋 Assignment tracking with email reminders
- 📊 Grade tracker with GPA per subject  
- 🤖 AI Tutor with file upload (photos & PDFs)
- 📝 Notes with AI summarization & study guides
- 👑 Pro plan with unlimited access

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm start
```

3. Build for production:
```bash
npm run build
```

## Configuration

Before deploying, update these values in `src/App.jsx`:
- `EMAILJS_SERVICE_ID` — your EmailJS service ID
- `EMAILJS_TEMPLATE_ID` — your EmailJS template ID  
- `EMAILJS_PUBLIC_KEY` — your EmailJS public key

## Deploy to Vercel

1. Push this folder to a GitHub repository
2. Go to vercel.com and import the repository
3. Click Deploy — done!
