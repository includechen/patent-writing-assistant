const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { checkAll, ensureAll } = require('../patent/deps');

const router = express.Router();

router.get('/status', authMiddleware, async (_req, res) => {
  try {
    const status = await checkAll();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/ensure', authMiddleware, async (req, res) => {
  try {
    const result = await ensureAll({ force: true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
