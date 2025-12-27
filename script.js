/* =================================================================
// script.js - v14.0 (Contega IOS-26 Final)
// ================================================================= */

// 定义常量
const PLAYER_AUTH_TOKEN = localStorage.getItem('playerAuthToken');
const IS_PLAYER_LOGGED_IN = !!PLAYER_AUTH_TOKEN;
const ADMIN_AUTH_TOKEN = localStorage.getItem('adminAuthToken');
const IS_ADMIN_LOGGED_IN = !!ADMIN_AUTH_TOKEN;


const SERVER_IP = '110.42.47.254'; 

document.addEventListener('DOMContentLoaded', function() {
    initializeBaseUI();
    initializeAnimations();
    updateNavbar();
    updateContactFormUI();
    
    // 监听工单提交
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactSubmit);
    }
    
    // 如果是管理员登录状态，添加特殊类名
    if (IS_ADMIN_LOGGED_IN) {
        document.body.classList.add('admin-view');
    }

    // 初始化服务器状态检查
    checkServerStatus();
    setInterval(checkServerStatus, 60000); // 每60秒刷新一次
});

/* --- 1. 基础 UI 交互 --- */
function initializeBaseUI() {
    // 移动端菜单切换
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }

    // 锚点平滑滚动
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        if (anchor.getAttribute('href') !== '#') {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                
                // 移动端点击后自动收起菜单
                if (navMenu && navMenu.classList.contains('active')) {
                    navMenu.classList.remove('active');
                    if (menuToggle) menuToggle.classList.remove('active');
                }

                if (targetElement) {
                    // 考虑到导航栏的高度偏移
                    const headerOffset = 80;
                    const elementPosition = targetElement.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: "smooth"
                    });
                }
            });
        }
    });

    // 导航栏滚动吸附效果 (Smart Sticky Header)
    const header = document.querySelector('header');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }

    // 彩蛋逻辑 (点击图片跳转)
    const secretIcon = document.querySelector('.floating-icon');
    if (secretIcon) {
        let clickCount = 0;
        let clickTimer = null;
        secretIcon.addEventListener('click', () => {
            clickCount++;
            // 添加简单的点击反馈动画
            secretIcon.style.transform = `scale(0.9)`;
            setTimeout(() => secretIcon.style.transform = `scale(1) translateY(-20px) rotate(5deg)`, 150);

            if (clickCount === 1) {
                clickTimer = setTimeout(() => { clickCount = 0; }, 1500);
            }
            if (clickCount === 5) {
                clearTimeout(clickTimer);
                // 这里可以跳转到管理员登录，或者其他彩蛋页面
                window.location.href = 'admin-login.html'; 
                clickCount = 0;
            }
        });
    }
}

/* --- 2. 滚动动画 (Intersection Observer) --- */
function initializeAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
                // 可选：动画完成后停止观察，避免重复动画
                // observer.unobserve(entry.target); 
            }
        });
    }, { threshold: 0.1 });

    // 选择所有需要动画的元素
    const animatedElements = document.querySelectorAll(
        '.hero-content h1, .hero-subtitle, .hero-actions, .server-status-container, ' +
        '.about h2, .about-text, .about-image, .glass-card, ' +
        '.rules-preview h2, .rule-card, ' +
        '.commands h2, .command-category, ' +
        '.contact h2, .contact-form'
    );
    animatedElements.forEach(el => observer.observe(el));
}

/* --- 3. 服务器状态检查 (MCSrvStat API) --- */
async function checkServerStatus() {
    const statusContainer = document.querySelector('.server-status');
    const statusText = document.querySelector('.status-text');
    const playerCount = document.querySelector('.player-count');
    const statusDot = document.querySelector('.status-dot');

    if (!statusContainer || !statusText || !playerCount) return;

    try {
        const response = await fetch(`https://api.mcsrvstat.us/3/${SERVER_IP}`);
        const data = await response.json();

        if (data.online) {
            // 在线状态
            if (statusDot) {
                statusDot.style.background = '#34C759';
                statusDot.style.boxShadow = '0 0 10px #34C759';
            }
            statusText.textContent = '系统在线';
            statusText.style.color = '#34C759';
            playerCount.textContent = `${data.players.online} / ${data.players.max} 筑界师在线`;
        } else {
            // 离线状态
            if (statusDot) {
                statusDot.style.background = '#FF3B30';
                statusDot.style.boxShadow = 'none';
                statusDot.classList.remove('pulsing');
            }
            statusText.textContent = '系统维护';
            statusText.style.color = '#FF3B30';
            playerCount.textContent = '连接中断';
        }
    } catch (error) {
        console.error('Check Status Failed:', error);
        statusText.textContent = '检测失败';
        playerCount.textContent = '无法获取数据';
    }
}

/* --- 4. 导航栏用户状态更新 --- */
function updateNavbar() {
    const authContainer = document.getElementById('auth-container');
    // 如果页面上没有登录容器（比如在某些特殊页面），则跳过
    if (!authContainer) return;

    const playerInfo = localStorage.getItem('playerInfo');
    const isLoggedIn = !!localStorage.getItem('playerAuthToken');

    // 默认显示登录按钮
    const showLoginButton = () => { 
        authContainer.innerHTML = '<a href="login.html" class="nav-link btn-glass-sm">登录</a>';
    };

    if (isLoggedIn && playerInfo) {
        try {
            const user = JSON.parse(playerInfo);
            // 渲染 iOS 风格的用户胶囊
            authContainer.innerHTML = `
                <div class="user-info-pill">
                    <i class="fas fa-user-circle" style="color: var(--ios-primary); font-size: 1.1rem;"></i>
                    <span class="user-name-span">${escapeHTML(user.username)}</span>
                    <button onclick="logout()" class="logout-btn-small" title="断开连接">
                        <i class="fas fa-power-off"></i>
                    </button>
                </div>`;
            
            // 检查特殊权限（如建筑表）
            checkAndShowSpecialLinks();
        } catch (e) {
            console.error('User info parse error:', e);
            localStorage.clear();
            showLoginButton();
        }
    } else {
        showLoginButton();
    }
}

// 退出登录函数 (全局可用)
window.logout = function() {
    localStorage.removeItem('playerAuthToken');
    localStorage.removeItem('playerInfo');
    
    // 添加退出动画反馈
    const pill = document.querySelector('.user-info-pill');
    if (pill) {
        pill.style.transform = 'scale(0.8)';
        pill.style.opacity = '0';
    }
    
    setTimeout(() => {
        window.location.reload();
    }, 300);
};

/* --- 5. 工单提交逻辑 --- */
function updateContactFormUI() {
    const playerMessageTextarea = document.getElementById('playerMessage');
    const contactSubmitButton = document.querySelector('#contactForm button[type="submit"]');
    
    if (!playerMessageTextarea || !contactSubmitButton) return;

    if (!IS_PLAYER_LOGGED_IN) {
        playerMessageTextarea.disabled = true;
        playerMessageTextarea.placeholder = '请先接入系统（登录），方可提交数据包。';
        playerMessageTextarea.style.opacity = '0.7';
        contactSubmitButton.disabled = true;
        contactSubmitButton.textContent = '需身份验证';
        contactSubmitButton.style.opacity = '0.6';
    }
}

async function handleContactSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const messageDiv = document.getElementById('formMessage');
    const submitButton = form.querySelector('button[type="submit"]');
    const playerMessage = document.getElementById('playerMessage').value.trim();
    const originalBtnText = submitButton.textContent;

    if (!playerMessage) {
        showMessage(messageDiv, '内容为空，无法发送。', 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> 发送中...';
    messageDiv.textContent = '';
    messageDiv.style.background = 'transparent';

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PLAYER_AUTH_TOKEN}`
            },
            body: JSON.stringify({ message: playerMessage })
        });

        const result = await response.json();
        if (!response.ok) { throw new Error(result.error || '传输中断'); }

        showMessage(messageDiv, '数据包已上传至中枢，管理员将尽快查阅。', 'success');
        form.reset();
    } catch (error) {
        showMessage(messageDiv, `发送失败: ${error.message}`, 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalBtnText;
    }
}

/* --- 6. 权限检查 (建筑表) --- */
async function checkAndShowSpecialLinks() {
    if (!PLAYER_AUTH_TOKEN) return;
    
    try {
        const response = await fetch('/api/player/check-permission', {
            headers: {
                'Authorization': `Bearer ${PLAYER_AUTH_TOKEN}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.hasPermission && data.url) {
                const linkContainer = document.getElementById('building-list-link');
                const linkAnchor = document.getElementById('building-list-anchor');
                if (linkContainer && linkAnchor) {
                    linkAnchor.href = data.url;
                    linkAnchor.target = '_blank';
                    linkContainer.style.display = 'block'; // 显示建筑表入口
                }
            }
        }
    } catch (error) {
        console.error('Permission check failed:', error);
    }
}

/* --- 7. 工具函数 --- */
function escapeHTML(str) {
    if (typeof str !== 'string' && str !== null && str !== undefined) { str = str.toString(); }
    if (!str) return '';
    return str.replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
}

function showMessage(element, text, type) {
    if (!element) return;
    element.textContent = text;
    if (type === 'success') {
        element.style.color = '#0d9488';
        element.style.background = 'rgba(13, 148, 136, 0.1)';
        element.style.padding = '10px';
        element.style.borderRadius = '8px';
    } else {
        element.style.color = '#ef4444';
        element.style.background = 'rgba(239, 68, 68, 0.1)';
        element.style.padding = '10px';
        element.style.borderRadius = '8px';
    }
}