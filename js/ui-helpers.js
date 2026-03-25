// ui-helpers.js
// Handles screen navigation and basic UI utilities

/**
 * Show a specific screen and hide all others
 */
function showScreen(screenName) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.remove('active'));
    
    const targetScreen = document.getElementById(screenName);
    if (targetScreen) {
        targetScreen.classList.add('active');
        window.scrollTo(0, 0);
    }

    // Hide the site header everywhere except the roster and character creation screens
    const header = document.querySelector('header');
    if (header) {
        header.style.display = ['roster', 'create'].includes(screenName) ? '' : 'none';
    }

    // Sync media control highlight when navigating to combat log
    if (screenName === 'combatlog' && typeof _updateMediaControls === 'function') {
        _updateMediaControls();
    }
}

/**
 * Show modal dialog
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
}

/**
 * Close modal dialog
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

/**
 * Clear all modals
 */
function closeAllModals() {
    const modals = document.querySelectorAll('[id$="Modal"]');
    modals.forEach(modal => {
        modal.style.display = 'none';
    });
}

/**
 * Format numbers with commas
 */
function formatNumber(num) {
    return Math.floor(num).toLocaleString();
}

/**
 * Calculate progress bar percentage
 */
function getProgressPercent(current, max) {
    return Math.min(100, Math.max(0, (current / max) * 100));
}

/**
 * Display success toast notification
 */
function showSuccess(message, duration = 3000) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.textContent = message;

    successDiv.style.position = 'fixed';
    successDiv.style.right = '20px';
    successDiv.style.zIndex = '9999';
    successDiv.style.minWidth = '300px';
    successDiv.style.padding = '12px 20px';
    successDiv.style.borderRadius = '8px';
    successDiv.style.backgroundColor = '#344638';
    successDiv.style.color = 'white';
    successDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    successDiv.style.opacity = '0';
    successDiv.style.transition = 'opacity 0.4s ease, transform 0.4s ease';

    // Stack multiple toasts
    const existing = document.querySelectorAll('.success');
    const offset = 20 + (existing.length * 60);
    successDiv.style.top = `${offset}px`;

    document.body.appendChild(successDiv);

    setTimeout(() => {
        successDiv.style.opacity = '1';
        successDiv.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        successDiv.style.opacity = '0';
        successDiv.style.transform = 'translateY(-20px)';
        setTimeout(() => successDiv.remove(), 400);
    }, duration);
}

/**
 * Display error toast notification
 */
function showError(message, duration = 4000) {
    console.error('[ERROR]', message);

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-toast';
    errorDiv.textContent = message;

    errorDiv.style.position = 'fixed';
    errorDiv.style.right = '20px';
    errorDiv.style.zIndex = '9999';
    errorDiv.style.minWidth = '300px';
    errorDiv.style.padding = '12px 20px';
    errorDiv.style.borderRadius = '8px';
    errorDiv.style.backgroundColor = '#6b2020';
    errorDiv.style.color = 'white';
    errorDiv.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    errorDiv.style.opacity = '0';
    errorDiv.style.transition = 'opacity 0.4s ease, transform 0.4s ease';

    // Stack below any existing toasts
    const existing = document.querySelectorAll('.success, .error-toast');
    const offset = 20 + (existing.length * 60);
    errorDiv.style.top = `${offset}px`;

    document.body.appendChild(errorDiv);

    setTimeout(() => {
        errorDiv.style.opacity = '1';
        errorDiv.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        errorDiv.style.opacity = '0';
        errorDiv.style.transform = 'translateY(-20px)';
        setTimeout(() => errorDiv.remove(), 400);
    }, duration);
}

/**
 * Get or create a persistent device ID for ownership tracking.
 * Not secure — replace with real auth when that system is built.
 */
function getDeviceId() {
    let id = localStorage.getItem('deviceId');
    if (!id) {
        id = 'device_' + crypto.randomUUID();
        localStorage.setItem('deviceId', id);
        // Stash original so admin panel can restore it after spoofing
        localStorage.setItem('_realDeviceId', id);
    }
    return id;
}

/**
 * Return to character detail screen after combat.
 * Reloads the character so XP, loot, and stats are fresh.
 * Also clears idle loop state since this is only called on hard stops (retreat).
 */
function returnToHub() {
    if (window.currentState) {
        window.currentState.idleActive = false;
        window.currentState.pendingLoopExit = false;
    }
    const characterId = window.currentState?.detailCharacterId;
    if (characterId && typeof showCharacterDetail === 'function') {
        showCharacterDetail(characterId);
    } else {
        showScreen('roster');
    }
}

/**
 * Escape a string for safe insertion into HTML attribute values and content.
 * Prevents XSS via crafted character names or other user-supplied strings.
 */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}


/**
 * Position a tooltip element near the cursor, clamped to the viewport.
 * Used by all JS-created tooltips (skill, gear, stat).
 * A 10px safe margin is maintained on all four edges.
 */
function positionTooltip(tooltip, event) {
    const margin = 10;
    const tw = tooltip.offsetWidth  || 300;
    const th = tooltip.offsetHeight || 100;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = event.clientX + 15;
    let top  = event.clientY + 15;

    // Clamp right edge
    if (left + tw > vw - margin) left = event.clientX - tw - 15;
    // Clamp left edge
    if (left < margin) left = margin;
    // Clamp bottom edge
    if (top + th > vh - margin) top = event.clientY - th - 15;
    // Clamp top edge
    if (top < margin) top = margin;

    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
}

/**
 * Shared JS tooltip for elements using data-tooltip attribute.
 * Replaces the CSS ::after approach so tooltips can be viewport-clamped.
 * Applied via event delegation on document — no per-element wiring needed.
 */
(function initDataTooltip() {
    let _tip = null;
    let _tipTimeout = null;

    const STYLE = [
        'position:fixed',
        'background:rgba(7,10,24,0.97)',
        'color:var(--text-primary, #c8cfe0)',
        'padding:0.5rem 0.8rem',
        'border-radius:4px',
        'border:1px solid rgba(74,74,138,0.55)',
        'font-size:0.78rem',
        'font-family:var(--font-body, sans-serif)',
        'max-width:280px',
        'white-space:normal',
        'line-height:1.5',
        'pointer-events:none',
        'z-index:10000',
        'box-shadow:0 8px 24px rgba(0,0,0,0.6)',
        'word-wrap:break-word',
        'box-sizing:border-box',
    ].join(';');

    function show(text, event) {
        hide();
        _tip = document.createElement('div');
        _tip.style.cssText = STYLE;
        _tip.textContent = text;
        document.body.appendChild(_tip);
        positionTooltip(_tip, event);
    }

    function hide() {
        clearTimeout(_tipTimeout);
        if (_tip) { _tip.remove(); _tip = null; }
    }

    document.addEventListener('mouseover', function(e) {
        const el = e.target.closest('[data-tooltip]');
        if (!el) return;
        clearTimeout(_tipTimeout);
        _tipTimeout = setTimeout(() => show(el.dataset.tooltip, e), 120);
    });

    document.addEventListener('mousemove', function(e) {
        if (_tip) positionTooltip(_tip, e);
    });

    document.addEventListener('mouseout', function(e) {
        if (!e.target.closest('[data-tooltip]')) return;
        hide();
    });

    document.addEventListener('touchstart', hide, { passive: true });
})();
