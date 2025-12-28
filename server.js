// =================================================================
// server.js - v14.0 (最终版 - 移除冗余功能 & 集成精美邮件)
// =================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');

// --- 1. 数据库连接配置 ---
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000
};

const jwtSecret = process.env.JWT_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const buildingListUrl = process.env.BUILDING_LIST_URL;

const pool = mysql.createPool(dbConfig);
const resend = new Resend(resendApiKey);
const app = express();

// --- 2. 中间件 ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// JWT 验证中间件
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).json({ error: '未提供凭证，禁止访问' });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(401).json({ error: '凭证无效或已过期' });
        req.user = user;
        next();
    });
};

// 管理员权限检查中间件
const checkAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: '权限拒绝：仅限管理员操作' });
    }
    next();
};

// 通用列表获取函数
const getList = (table, order = 'id ASC') => async (req, res) => {
    try {
        const [rows] = await pool.execute(`SELECT * FROM ${table} ORDER BY ${order}`);
        res.json(rows);
    } catch (err) { 
        console.error(`Error fetching ${table}:`, err);
        res.status(500).json({ error: '数据读取失败' }); 
    }
};

// --- 3. 公共 API (无需登录) ---

// 获取基础列表
app.get('/api/rules', getList('server_rules')); // 规则
app.get('/api/announcements', getList('announcements', 'created_at DESC')); // 公告
app.get('/api/commands', getList('server_commands')); // 指令
app.get('/api/bans', getList('banned_players', 'ban_date DESC')); // 封禁墙
app.get('/api/sponsors', getList('sponsors', 'created_at DESC')); // 赞助/供奉

// --- 4. 身份认证 API (注册/登录) ---

// 注册 - 发送验证码 (含精美 HTML 邮件)
app.post('/api/register', async (req, res) => {
    const { player_name, email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) return res.status(400).json({ error: '两次输入的密码不一致' });

    try {
        const [existing] = await pool.execute('SELECT id FROM players WHERE email = ? OR player_name = ?', [email, player_name]);
        if (existing.length > 0) return res.status(409).json({ error: '玩家名或邮箱已被注册' });

        const password_hash = await bcrypt.hash(password, 10);
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // 存入待验证表 (有效期20分钟)
        await pool.execute(
            `INSERT INTO pending_verifications (email, player_name, password_hash, verification_code, expires_at) 
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 20 MINUTE)) 
             ON DUPLICATE KEY UPDATE verification_code = ?, expires_at = DATE_ADD(NOW(), INTERVAL 20 MINUTE)`,
            [email, player_name, password_hash, code, code]
        );

        // --- iOS 26 风格 HTML 邮件模板 ---
        const emailHtml = `
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f0fdfa; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 40px rgba(13, 148, 136, 0.1); border: 1px solid rgba(13, 148, 136, 0.1); }
                    .header { background: linear-gradient(135deg, #0d9488 0%, #10b981 100%); padding: 40px 20px; text-align: center; }
                    .logo-text { color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: 2px; margin: 0; text-transform: uppercase; }
                    .content { padding: 40px 30px; text-align: center; color: #1d1d1f; }
                    .title { font-size: 20px; font-weight: 600; margin-bottom: 10px; color: #0f172a; }
                    .subtitle { font-size: 14px; color: #64748b; margin-bottom: 30px; }
                    .code-box { background-color: #f0fdfa; border: 1px dashed #0d9488; border-radius: 16px; padding: 20px; margin: 0 auto 30px; display: inline-block; min-width: 200px; }
                    .code { font-family: 'Courier New', monospace; font-size: 36px; font-weight: 700; color: #0d9488; letter-spacing: 8px; margin: 0; }
                    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 class="logo-text">CONTEGA</h1>
                        <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin-top: 5px;">筑 界 物 语 / ID VERIFICATION</p>
                    </div>
                    <div class="content">
                        <h2 class="title">身份接入请求确认</h2>
                        <p class="subtitle">欢迎接入 Contega 神经网络。请在您的终端输入以下安全代码以完成档案建立。</p>
                        <div class="code-box">
                            <h3 class="code">${code}</h3>
                        </div>
                        <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
                            此代码将在 <strong>20 分钟</strong> 后失效。<br>
                            如果这不是您的操作，请忽略此信号。
                        </p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2025 Contega Server System. All rights reserved.</p>
                        <p>此邮件由中枢系统自动发送，请勿回复。</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await resend.emails.send({
            from: 'Contega Server <message@betteryuan.cn>',
            to: email,
            subject: `【${code}】Contega 筑界物语 - 身份验证代码`,
            html: emailHtml
        });

        res.json({ message: '验证代码已发送' });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: '注册服务暂时不可用' }); 
    }
});

// 注册 - 验证并创建账号
app.post('/api/verify-email', async (req, res) => {
    const { email, code } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM pending_verifications WHERE email = ?', [email]);
        const pending = rows[0];

        if (!pending || pending.verification_code !== code) return res.status(400).json({ error: '验证码错误' });
        if (new Date(pending.expires_at) < new Date()) return res.status(400).json({ error: '验证码已过期' });

        await pool.execute(
            'INSERT INTO players (player_name, email, password_hash) VALUES (?, ?, ?)',
            [pending.player_name, pending.email, pending.password_hash]
        );
        await pool.execute('DELETE FROM pending_verifications WHERE email = ?', [email]);

        res.status(201).json({ message: '档案建立成功' });
    } catch (err) { res.status(500).json({ error: '验证过程出错' }); }
});

// 玩家登录
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM players WHERE player_name = ? OR email = ?', [identifier, identifier]);
        const player = rows[0];

        if (player && await bcrypt.compare(password, player.password_hash)) {
            const token = jwt.sign({ id: player.id, player_name: player.player_name }, jwtSecret, { expiresIn: '3d' });
            return res.json({ token, user: { id: player.id, username: player.player_name } });
        }
        res.status(401).json({ error: 'ID 或密钥错误' });
    } catch (err) { res.status(500).json({ error: '登录服务异常' }); }
});

// --- 5. 玩家功能 API ---

// 提交工单 (Contact)
app.post('/api/contact', verifyToken, async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: '内容为空' });
    try {
        const [rows] = await pool.execute('SELECT email FROM players WHERE id = ?', [req.user.id]);
        await pool.execute(
            'INSERT INTO contact_messages (player_name, email, message) VALUES (?, ?, ?)',
            [req.user.player_name, rows[0].email, message]
        );
        res.json({ message: '数据包已发送' });
    } catch (err) { res.status(500).json({ error: '提交失败' }); }
});

// 检查权限 (建筑表)
app.get('/api/player/check-permission', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT player_id FROM special_permissions WHERE player_id = ?', [req.user.id]);
        res.json({ hasPermission: rows.length > 0, url: rows.length > 0 ? buildingListUrl : null });
    } catch (err) { res.status(500).json({ error: '权限校验错误' }); }
});

// --- 6. 管理员 API (需 Admin Token) ---

// 管理员登录
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        const admin = rows[0];
        if (admin && await bcrypt.compare(password, admin.password_hash)) {
            const token = jwt.sign({ id: admin.id, username: admin.username, isAdmin: true }, jwtSecret, { expiresIn: '12h' });
            return res.json({ token });
        }
        res.status(401).json({ error: '管理员认证失败' });
    } catch (err) { res.status(500).json({ error: '后台服务异常' }); }
});

// --- [新] 规则管理 API ---
app.post('/api/admin/rules', verifyToken, checkAdmin, async (req, res) => {
    const { content, punishment } = req.body;
    if (!content) return res.status(400).json({ error: '规则内容不能为空' });
    try {
        await pool.execute('INSERT INTO server_rules (content, punishment) VALUES (?, ?)', [content, punishment || '无']);
        res.json({ message: '规则已新增' });
    } catch (err) { res.status(500).json({ error: '添加规则失败' }); }
});

app.delete('/api/admin/rules/:id', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM server_rules WHERE id = ?', [req.params.id]);
        res.json({ message: '规则已移除' });
    } catch (err) { res.status(500).json({ error: '删除规则失败' }); }
});

// --- [新] 公告管理 API ---
app.post('/api/admin/announcements', verifyToken, checkAdmin, async (req, res) => {
    const { title, content, priority = 0 } = req.body; // 默认 0
    if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
    try {
        await pool.execute('INSERT INTO announcements (title, content, priority) VALUES (?, ?, ?)', [title, content, priority]);
        res.json({ message: '公告发布成功' });
    } catch (err) { res.status(500).json({ error: '发布公告失败' }); }
});

app.patch('/api/admin/announcements/:id', verifyToken, checkAdmin, async (req, res) => {
    const { title, content, priority } = req.body;
    const id = req.params.id;

    try {
        await pool.execute(
            'UPDATE announcements SET title = ?, content = ?, priority = ? WHERE id = ?',
            [title, content, priority, id]
        );
        res.json({ message: '公告更新成功' });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: '更新失败' }); 
    }
});

app.delete('/api/admin/announcements/:id', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM announcements WHERE id = ?', [req.params.id]);
        res.json({ message: '公告已删除' });
    } catch (err) { res.status(500).json({ error: '删除公告失败' }); }
});

// --- 工单/消息管理 ---
app.get('/api/admin/messages', verifyToken, checkAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: '获取工单失败' }); }
});

app.delete('/api/admin/messages/:id', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM contact_messages WHERE id = ?', [req.params.id]);
        res.json({ message: '工单已处理' });
    } catch (err) { res.status(500).json({ error: '删除工单失败' }); }
});

// --- 玩家管理与授权 ---
app.get('/api/admin/players', verifyToken, checkAdmin, async (req, res) => {
    try {
        const [players] = await pool.execute('SELECT id, player_name, email, created_at FROM players ORDER BY created_at DESC');
        const [perms] = await pool.execute('SELECT player_id FROM special_permissions');
        const permSet = new Set(perms.map(p => p.player_id));
        res.json(players.map(p => ({ ...p, has_permission: permSet.has(p.id) })));
    } catch (err) { res.status(500).json({ error: '玩家列表获取失败' }); }
});

app.post('/api/admin/permissions', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('INSERT IGNORE INTO special_permissions (player_id) VALUES (?)', [req.body.player_id]);
        res.json({ message: '权限授予成功' });
    } catch (err) { res.status(500).json({ error: '授权失败' }); }
});

app.delete('/api/admin/permissions/:id', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM special_permissions WHERE player_id = ?', [req.params.id]);
        res.json({ message: '权限已撤销' });
    } catch (err) { res.status(500).json({ error: '撤销失败' }); }
});

// 删除玩家 (危险操作)
app.delete('/api/admin/players/:id', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM players WHERE id = ?', [req.params.id]);
        res.json({ message: '玩家档案已彻底删除' });
    } catch (err) { res.status(500).json({ error: '删除玩家失败' }); }
});

// --- 赞助者管理 ---
app.post('/api/admin/sponsors', verifyToken, checkAdmin, async (req, res) => {
    const { name, amount } = req.body;
    try {
        await pool.execute('INSERT INTO sponsors (name, amount) VALUES (?, ?)', [name, amount]);
        res.json({ message: '录入成功' });
    } catch (err) { res.status(500).json({ error: '录入失败' }); }
});

app.delete('/api/admin/sponsors/:id', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM sponsors WHERE id = ?', [req.params.id]);
        res.json({ message: '记录已移除' });
    } catch (err) { res.status(500).json({ error: '删除失败' }); }
});

// --- 启动服务器 ---
module.exports = app;