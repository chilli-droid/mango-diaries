const THEME_KEY = 'journal-theme';
const THEME_SWITCHER_MINIMIZED_KEY = 'theme-switcher-minimized';

// Get saved theme or default
function getCurrentTheme() {
    return localStorage.getItem(THEME_KEY) || 'default';
}

// Apply theme
function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem(THEME_KEY, themeName);
    
    // Update active button
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.theme === themeName) {
            btn.classList.add('active');
        }
    });
}

// Function to toggle the theme switcher's minimized state
function toggleThemeSwitcher() {
    const themeSwitcher = document.querySelector('.theme-switcher');
    const minimizeButton = themeSwitcher.querySelector('.minimize-button');
    const isMinimized = themeSwitcher.classList.contains('minimized');
    
    if (isMinimized) {
        themeSwitcher.classList.remove('minimized');
        minimizeButton.innerHTML = '−';
        localStorage.removeItem('theme-switcher-minimized');
    } else {
        themeSwitcher.classList.add('minimized');
        minimizeButton.innerHTML = '+';
        localStorage.setItem('theme-switcher-minimized', 'true');
    }
}

// Initialize theme switcher state on page load
function initializeThemeSwitcherState() {
    const themeSwitcher = document.querySelector('.theme-switcher');
    const minimizeButton = themeSwitcher.querySelector('.minimize-button');
    const isMinimized = localStorage.getItem(THEME_SWITCHER_MINIMIZED_KEY) === 'true';
    
    if (isMinimized) {
        themeSwitcher.classList.add('minimized');
        minimizeButton.innerHTML = '+';
    }

    // Add click handler for minimized state
    themeSwitcher.addEventListener('click', (e) => {
        if (themeSwitcher.classList.contains('minimized') && e.target === themeSwitcher) {
            toggleThemeSwitcher();
        }
    });
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const currentTheme = getCurrentTheme();
    applyTheme(currentTheme);
    initializeThemeSwitcherState();
});

// Theme button click handlers
function setupThemeSwitcher() {
    // Add minimize button to theme switcher
    const themeSwitcher = document.querySelector('.theme-switcher');
    if (!themeSwitcher.querySelector('.minimize-button')) {
        const minimizeButton = document.createElement('button');
        minimizeButton.className = 'minimize-button';
        minimizeButton.innerHTML = '−';
        themeSwitcher.insertBefore(minimizeButton, themeSwitcher.firstChild);
    }

    // Theme button click handlers
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            applyTheme(theme);
        });
    });

    // Minimize button click handler
    const minimizeButton = themeSwitcher.querySelector('.minimize-button');
    minimizeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleThemeSwitcher();
    });

    // Click handler for minimized state
    themeSwitcher.addEventListener('click', (e) => {
        if (themeSwitcher.classList.contains('minimized')) {
            toggleThemeSwitcher();
        }
    });

    // Initialize minimized state from localStorage
    const isMinimized = localStorage.getItem('theme-switcher-minimized') === 'true';
    if (isMinimized) {
        themeSwitcher.classList.add('minimized');
        minimizeButton.innerHTML = '+';
    }
}
 