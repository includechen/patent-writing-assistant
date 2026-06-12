const express = require('express');
const { getDauStats, getChatUsageStats, getOverviewStats } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/overview', (_req, res) => {
  res.json(getOverviewStats());
});

router.get('/dau', (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
  res.json(getDauStats(days));
});

router.get('/chat-usage', (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
  res.json(getChatUsageStats(days));
});

router.get('/combined', (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 30, 90);
  const dau = getDauStats(days);
  const chats = getChatUsageStats(days);
  const dateMap = new Map();

  for (const row of dau) {
    dateMap.set(row.date, { date: row.date, dau: row.dau, chatCount: 0 });
  }
  for (const row of chats) {
    const existing = dateMap.get(row.date) || { date: row.date, dau: 0, chatCount: 0 };
    existing.chatCount = row.count;
    dateMap.set(row.date, existing);
  }

  const series = [...dateMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  res.json({ overview: getOverviewStats(), series });
});

module.exports = router;
