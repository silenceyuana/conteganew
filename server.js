// =================================================================
// server.js - v12.0 (终极完整版 - MySQL 5.6 & Vercel 适配)
// =================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Resend } = require('resend');
const crypto = require('crypto');

// --- 1. 数据库连接池配置 ---
const dbConfig = {
    host: process.env.DB_HOST,      // 建议使用解析好的域名
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000 // 10秒连接超时，适合跨国连接
};

const jwtSecret = process.env.JWT_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const baseUrl = process.env.BASE_URL;
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
    if (!token) return res.status(403).json({ error: '没有提供Token，禁止访问' });

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) return res.status(401).json({ error: 'Token无效或已过期' });
        req.user = user;
        next();
    });
};

// 管理员权限检查中间件
const checkAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ error: '权限不足，仅限管理员操作' });
    }
    next();
};

// --- 3. 公共 API (无需登录) ---

// 获取服主状态
app.get('/api/owner-status', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT status FROM owner_status WHERE id = 1');
        res.json(rows[0] || { status: 'awake' });
    } catch (err) { res.status(500).json({ error: '数据库读取失败' }); }
});

// 动态获取列表工具函数
const getList = (table, order = 'id ASC') => async (req, res) => {
    try {
        const [rows] = await pool.execute(`SELECT * FROM ${table} ORDER BY ${order}`);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

app.get('/api/rules', getList('server_rules'));
app.get('/api/commands', getList('server_commands'));
app.get('/api/bans', getList('banned_players', 'ban_date DESC'));
app.get('/api/sponsors', getList('sponsors', 'created_at DESC'));

// --- 4. 身份认证 API ---

// 用户注册并发送验证邮件
app.post('/api/register', async (req, res) => {
    const { player_name, email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) return res.status(400).json({ error: '两次密码不一致' });

    try {
        const [existing] = await pool.execute('SELECT id FROM players WHERE email = ? OR player_name = ?', [email, player_name]);
        if (existing.length > 0) return res.status(409).json({ error: '玩家名或邮箱已存在' });

        const password_hash = await bcrypt.hash(password, 10);
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        // 兼容 MySQL 5.6: 在 SQL 中计算过期时间
        await pool.execute(
            `INSERT INTO pending_verifications (email, player_name, password_hash, verification_code, expires_at) 
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 20 MINUTE)) 
             ON DUPLICATE KEY UPDATE verification_code = ?, expires_at = DATE_ADD(NOW(), INTERVAL 20 MINUTE)`,
            [email, player_name, password_hash, code, code]
        );

        // 完整 HTML 邮件 UI
        const emailHtml = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 550px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
                <div style="text-align: center; padding-bottom: 20px;">
                    <h1 style="color: #3f51b5; margin: 0; font-size: 28px;">Eulark 生电服务器</h1>
                    <p style="color: #666; font-size: 14px;">科技感十足的生电之旅</p>
                </div>
                <div style="padding: 20px; background-color: #f9f9f9; border-radius: 8px; text-align: center;">
                    <p style="font-size: 16px; color: #333;">你好！这是您的注册验证码：</p>
                    <h2 style="font-size: 42px; color: #3f51b5; letter-spacing: 8px; margin: 20px 0;">${code}</h2>
                    <p style="font-size: 13px; color: #888;">有效期为 20 分钟，请勿泄露给他人。</p>
                </div>
                <p style="margin-top: 25px; font-size: 12px; color: #bbb; text-align: center;">如果您没有尝试注册，请忽略此邮件。<br>© 2025 Eulark Server Team</p>
            </div>
        `;

        await resend.emails.send({
            from: 'Eulark 服务器 <message@betteryuan.cn>',
            to: email,
            subject: '欢迎加入 Eulark - 邮箱验证码',
            html: emailHtml
        });

        res.json({ message: '验证码已发送至您的邮箱' });
    } catch (err) { res.status(500).json({ error: '注册请求失败' }); }
});

// 验证邮件并正式创建账号
app.post('/api/verify-email', async (req, res) => {
    const { email, code } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM pending_verifications WHERE email = ?', [email]);
        const pending = rows[0];

        if (!pending || pending.verification_code !== code) return res.status(400).json({ error: '验证码错误' });
        if (new Date(pending.expires_at) < new Date()) return res.status(400).json({ error: '验证码已过期，请重新注册' });

        await pool.execute(
            'INSERT INTO players (player_name, email, password_hash) VALUES (?, ?, ?)',
            [pending.player_name, pending.email, pending.password_hash]
        );
        await pool.execute('DELETE FROM pending_verifications WHERE email = ?', [email]);

        res.status(201).json({ message: '账号创建成功，请前往登录' });
    } catch (err) { res.status(500).json({ error: '验证失败' }); }
});

// 登录接口
app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM players WHERE player_name = ? OR email = ?', [identifier, identifier]);
        const player = rows[0];

        if (player && await bcrypt.compare(password, player.password_hash)) {
            const token = jwt.sign({ id: player.id, player_name: player.player_name }, jwtSecret, { expiresIn: '1d' });
            return res.json({ token, user: { id: player.id, username: player.player_name } });
        }
        res.status(401).json({ error: '玩家名或密码错误' });
    } catch (err) { res.status(500).json({ error: '服务器连接异常' }); }
});

// 忘记密码 - 发送重置链接
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        const [rows] = await pool.execute('SELECT player_name FROM players WHERE email = ?', [email]);
        if (rows.length === 0) return res.json({ message: '如果邮箱已注册，重置邮件将很快发出' });

        const token = crypto.randomBytes(32).toString('hex');
        await pool.execute(
            'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR)) ON DUPLICATE KEY UPDATE token = ?, expires_at = DATE_ADD(NOW(), INTERVAL 1 HOUR)',
            [email, token, token]
        );

        const resetLink = `${baseUrl}/reset-password.html?token=${token}`;
        const resetHtml = `
            <div style="font-family: sans-serif; max-width: 500px; margin: auto; padding: 25px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #3f51b5; text-align: center;">重置您的密码</h2>
                <p>你好 ${rows[0].player_name}，点击下方按钮即可设置新密码：</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="background: #3f51b5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">重置我的密码</a>
                </div>
                <p style="color: #999; font-size: 12px;">链接1小时内有效。如果您未申请重置，请忽略。</p>
            </div>
        `;

        await resend.emails.send({
            from: 'Eulark 服务器 <message@betteryuan.cn>',
            to: email,
            subject: 'Eulark 密码重置请求',
            html: resetHtml
        });
        res.json({ message: '如果邮箱已注册，重置邮件将很快发出' });
    } catch (err) { res.status(500).json({ error: '发送重置邮件失败' }); }
});

// --- 5. 玩家受保护 API ---

app.post('/api/contact', verifyToken, async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: '内容不能为空' });
    try {
        const [rows] = await pool.execute('SELECT email FROM players WHERE id = ?', [req.user.id]);
        await pool.execute(
            'INSERT INTO contact_messages (player_name, email, message) VALUES (?, ?, ?)',
            [req.user.player_name, rows[0].email, message]
        );
        res.json({ message: '工单已提交' });
    } catch (err) { res.status(500).json({ error: '提交失败' }); }
});

app.get('/api/player/check-permission', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT player_id FROM special_permissions WHERE player_id = ?', [req.user.id]);
        res.json({ hasPermission: rows.length > 0, url: rows.length > 0 ? buildingListUrl : null });
    } catch (err) { res.status(500).json({ error: '权限查询失败' }); }
});

// --- 6. 管理员 API (需管理员 Token) ---

app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
        const admin = rows[0];
        if (admin && await bcrypt.compare(password, admin.password_hash)) {
            const token = jwt.sign({ id: admin.id, username: admin.username, isAdmin: true }, jwtSecret, { expiresIn: '8h' });
            return res.json({ token });
        }
        res.status(401).json({ error: '管理员账号或密码错误' });
    } catch (err) { res.status(500).json({ error: '数据库查询异常' }); }
});

// 管理员获取工单列表 (之前丢失的路由)
app.get('/api/admin/messages', verifyToken, checkAdmin, async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM contact_messages ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: '无法获取工单列表' }); }
});

app.delete('/api/admin/messages/:id', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM contact_messages WHERE id = ?', [req.params.id]);
        res.json({ message: '工单已处理/删除' });
    } catch (err) { res.status(500).json({ error: '删除工单失败' }); }
});

// 管理员用户管理
app.get('/api/admin/players', verifyToken, checkAdmin, async (req, res) => {
    try {
        const [players] = await pool.execute('SELECT id, player_name, email, created_at FROM players ORDER BY created_at DESC');
        const [perms] = await pool.execute('SELECT player_id FROM special_permissions');
        const permSet = new Set(perms.map(p => p.player_id));
        res.json(players.map(p => ({ ...p, has_permission: permSet.has(p.id) })));
    } catch (err) { res.status(500).json({ error: '拉取用户列表失败' }); }
});

app.post('/api/admin/permissions', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('INSERT IGNORE INTO special_permissions (player_id) VALUES (?)', [req.body.player_id]);
        res.json({ message: '权限授予成功' });
    } catch (err) { res.status(500).json({ error: '授权操作失败' }); }
});

app.delete('/api/admin/permissions/:id', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM special_permissions WHERE player_id = ?', [req.params.id]);
        res.json({ message: '权限撤销成功' });
    } catch (err) { res.status(500).json({ error: '撤销操作失败' }); }
});

// 服主在线状态控制
app.post('/api/admin/sleep', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute("UPDATE owner_status SET status = 'sleep' WHERE id = 1");
        res.json({ message: '状态更新: 睡眠' });
    } catch (err) { res.status(500).json({ error: '更新失败' }); }
});

app.post('/api/admin/wake', verifyToken, checkAdmin, async (req, res) => {
    try {
        await pool.execute("UPDATE owner_status SET status = 'awake' WHERE id = 1");
        res.json({ message: '状态更新: 苏醒' });
    } catch (err) { res.status(500).json({ error: '更新失败' }); }
});

// --- 7. 导出 ---
module.exports = app;