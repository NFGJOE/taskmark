# TaskMark — AI Homework Tracker

TaskMark is an AI-powered homework tracker and study assistant for students.

## Features

- 📋 **Assignment Tracker** — track homework with due dates, subjects, and priorities
- 📊 **Grade Tracker** — log grades and see your average per subject
- 🤖 **AI Tutor** — ask any question, upload photos/PDFs of homework
- 📝 **Notes** — save class notes, get AI summaries and study guides
- 📧 **Email Reminders** — get reminders 1–5 days before assignments are due
- 👑 **Pro Plan** — unlimited everything for $2/month or $20/year

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure EmailJS (for email reminders)
Open `src/App.jsx` and replace these values at the top:
```js
const EMAILJS_SERVICE_ID  = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY  = "YOUR_PUBLIC_KEY";
```
Sign up free at [emailjs.com](https://emailjs.com) to get these values.

### 3. Run locally
```bash
npm start
```

### 4. Deploy to Vercel
Push to GitHub, then import on [vercel.com](https://vercel.com).

## Tech Stack

- React 18
- Anthropic Claude API (AI Tutor)
- EmailJS (email reminders)
- localStorage (data persistence)
