const { db } = require('../db');

/** 桌面端本地单用户（无登录、无远程数据库） */
function resolveLocalUser() {
  let user = db.findUser({ username: 'local' });
  if (!user) user = db.findUser({ username: 'admin' });
  if (!user && db.users.length > 0) user = db.users[0];
  if (!user) {
    db.insertUser({
      username: 'local',
      password_hash: '',
      display_name: '本地用户',
      role: 'user',
    });
    user = db.findUser({ username: 'local' });
  }
  return user;
}

function authMiddleware(req, res, next) {
  const row = resolveLocalUser();
  if (!row) {
    return res.status(500).json({ error: '本地用户初始化失败' });
  }
  req.user = {
    id: row.id,
    username: row.username,
    role: row.role || 'user',
    displayName: row.display_name || row.username,
  };
  next();
}

function adminMiddleware(_req, res, next) {
  next();
}

module.exports = { resolveLocalUser, authMiddleware, adminMiddleware };
