const express = require('express');
const { authMiddleware, resolveLocalUser } = require('../middleware/auth');

const router = express.Router();

router.get('/me', authMiddleware, (req, res) => {
  const row = resolveLocalUser();
  res.json({
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    role: row.role,
    createdAt: row.created_at,
    localOnly: true,
  });
});

module.exports = router;
