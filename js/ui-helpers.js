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
