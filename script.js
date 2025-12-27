/* =================================================================
// script.js - v7.6 (更新彩蛋链接到 sleep.html)
// ================================================================= */

const PLAYER_AUTH_TOKEN = localStorage.getItem('playerAuthToken');
const IS_PLAYER_LOGGED_IN = !!PLAYER_AUTH_TOKEN;
const ADMIN_AUTH_TOKEN = localStorage.getItem('adminAuthToken');
const IS_ADMIN_LOGGED_IN = !!ADMIN_AUTH_TOKEN;

document.addEventListener('DOMContentLoaded', function() {
    initializeBaseUI();
    initializeAnimations();
    updateNavbar();
    updateContactFormUI();
    
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactSubmit);
    }
    
    if (IS_ADMIN_LOGGED_IN) {
        document.body.classList.add('admin-view');
    }
});

function initializeBaseUI() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            menuToggle.classList.toggle('active');
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        if (anchor.getAttribute('href') !== '#') {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const targetElement = document.querySelector(this.getAttribute('href'));
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            });
        }
    });

    window.addEventListener('scroll', () => {
        const header = document.querySelector('header');
        if (header) {
            header.style.boxShadow = window.scrollY > 50 ? '0 2px 20px rgba(0, 0, 0, 0.1)' : 'none';
        }
    });

    const secretIcon = document.getElementById('secret-icon');
    if (secretIcon) {
        let clickCount = 0;
        let clickTimer = null;
        secretIcon.addEventListener('click', () => {
            clickCount++;
            if (clickCount === 1) {
                clickTimer = setTimeout(() => { clickCount = 0; }, 1500);
            }
            if (clickCount === 3) {
                clearTimeout(clickTimer);
                window.open('sleep.html', '_blank');
                clickCount = 0;
            }
        });
    }

    checkServerStatus();
    setInterval(checkServerStatus, 60000);
}

function initializeAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, { threshold: 0.1 });

    const animatedElements = document.querySelectorAll(
        '.hero-content h1, .hero-subtitle, .cta-button, .server-status-container, ' +
        '.about h2, .about-text, .about-image, ' +
        '.rules-preview h2, .rule-card, ' +
        '.commands h2, .command-category, ' +
        '.contact h2, .contact-form'
    );
    animatedElements.forEach(el => observer.observe(el));
}

async function checkServerStatus() {
    const statusContainer = document.querySelector('.server-status');
    const statusText = document.querySelector('.status-text');
    const playerCount = document.querySelector('.player-count');
    if (!statusContainer || !statusText || !playerCount) return;
    try {
        const response = await fetch(`https://api.mcsrvstat.us/3/play.eulark.tech`);
        const data = await response.json();
        if (data.online) {
            statusContainer.className = 'server-status online';
            statusText.textContent = '在线';
            playerCount.textContent = data.players ? `${data.players.online} / ${data.players.max} 玩家` : '玩家信息未知';
        } else {
            statusContainer.className = 'server-status offline';
            statusText.textContent = '离线';
            playerCount.textContent = '服务器当前离线';
        }
    } catch (error) {
        console.error('检查服务器状态失败:', error);
        statusContainer.className = 'server-status offline';
        statusText.textContent = '错误';
        playerCount.textContent = '无法获取服务器状态';
    }
}

function updateNavbar() {
    const authContainer = document.getElementById('auth-container');
    const playerInfo = localStorage.getItem('playerInfo');
    const showLoginButton = () => { 
        if (authContainer) {
            authContainer.innerHTML = '<a href="login.html" class="nav-link"><b>登录</b></a>';
        }
    };
    const isLoggedIn = !!localStorage.getItem('playerAuthToken');
    if (isLoggedIn && playerInfo && authContainer) {
        try {
            const user = JSON.parse(playerInfo);
            authContainer.innerHTML = `
                <div class="user-info-pill">
                    <i class="fas fa-user-circle"></i>
                    <span>${escapeHTML(user.username)}</span>
                    <button onclick="logout()" class="logout-btn-small" title="退出登录">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>`;
            checkAndShowSpecialLinks();
        } catch (e) {
            localStorage.clear();
            showLoginButton();
        }
    } else {
        showLoginButton();
    }
}

function logout() {
    localStorage.removeItem('playerAuthToken');
    localStorage.removeItem('playerInfo');
    alert('已成功退出！');
    window.location.reload();
}

function updateContactFormUI() {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;
    const playerMessageTextarea = document.getElementById('playerMessage');
    const contactSubmitButton = contactForm.querySelector('button[type="submit"]');
    if (!localStorage.getItem('playerAuthToken')) {
        if (playerMessageTextarea) {
            playerMessageTextarea.disabled = true;
            playerMessageTextarea.placeholder = '请先登录，才能提交工单。';
        }
        if (contactSubmitButton) { contactSubmitButton.disabled = true; }
    }
}

async function handleContactSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const messageDiv = document.getElementById('formMessage');
    const submitButton = form.querySelector('button[type="submit"]');
    const playerMessage = document.getElementById('playerMessage').value.trim();
    if (!playerMessage) {
        messageDiv.textContent = '消息内容不能为空！';
        messageDiv.style.color = '#e74c3c';
        return;
    }
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在发送...';
    messageDiv.textContent = '';
    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('playerAuthToken')}`
            },
            body: JSON.stringify({ message: playerMessage })
        });
        const result = await response.json();
        if (!response.ok) { throw new Error(result.error || '发生未知错误'); }
        messageDiv.textContent = '消息发送成功！管理员将会尽快处理。';
        messageDiv.style.color = '#2ecc71';
        form.reset();
    } catch (error) {
        messageDiv.textContent = `发送失败: ${error.message}`;
        messageDiv.style.color = '#e74c3c';
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '发送消息';
    }
}

async function checkAndShowSpecialLinks() {
    const currentAuthToken = localStorage.getItem('playerAuthToken');
    if (!currentAuthToken) return;
    try {
        const response = await fetch('/api/player/check-permission', {
            headers: {
                'Authorization': `Bearer ${currentAuthToken}`
            }
        });
        if (!response.ok) {
            console.error('无法检查特殊权限:', response.statusText);
            return;
        }
        const data = await response.json();
        if (data.hasPermission && data.url) {
            const linkContainer = document.getElementById('building-list-link');
            const linkAnchor = document.getElementById('building-list-anchor');
            if (linkContainer && linkAnchor) {
                linkAnchor.href = data.url;
                linkAnchor.target = '_blank';
                linkContainer.style.display = 'list-item';
            }
        }
    } catch (error) {
        console.error('检查特殊权限时发生网络错误:', error);
    }
}
/* --- 导航栏滚动监听脚本 --- */
document.addEventListener('DOMContentLoaded', function() {
    const header = document.querySelector('header');
    
    // 监听滚动事件
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            // 当滚动超过 50px 时，添加 scrolled 类（变宽、贴顶）
            header.classList.add('scrolled');
        } else {
            // 回到顶部时，恢复悬浮胶囊样式
            header.classList.remove('scrolled');
        }
    });
});

function escapeHTML(str) {
    if (typeof str !== 'string' && str !== null && str !== undefined) { str = str.toString(); }
    if (!str) return '';
    return str.replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
}