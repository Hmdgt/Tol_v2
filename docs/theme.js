// ===============================
// 🎨 SISTEMA DE TEMAS (DARK / LIGHT)
// ===============================

// Função para alternar tema
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    updateThemeUI(newTheme);
    
    // Atualizar meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        if (newTheme === 'light') {
            metaThemeColor.setAttribute('content', '#ffffff');
        } else {
            metaThemeColor.setAttribute('content', '#000000');
        }
    }
    
    // Disparar evento para outros componentes (ex: app.js)
    window.dispatchEvent(new Event('themeChanged'));
    
    console.log(`🎨 Tema alterado para: ${newTheme}`);
}

// Atualizar UI do botão de tema
function updateThemeUI(theme) {
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');
    
    if (!themeIcon || !themeText) return;
    
    if (theme === 'light') {
        themeIcon.setAttribute('name', 'moon-outline');
        themeText.textContent = 'Dark Mode';
    } else {
        themeIcon.setAttribute('name', 'sunny-outline');
        themeText.textContent = 'Light Mode';
    }
}

// Carregar tema salvo
function loadTheme() {
    const savedTheme = localStorage.getItem('theme');
    let theme = savedTheme;
    
    // Se não houver tema salvo, usar preferência do sistema
    if (!savedTheme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
    }
    
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeUI(theme);
    
    // Atualizar meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        if (theme === 'light') {
            metaThemeColor.setAttribute('content', '#ffffff');
        } else {
            metaThemeColor.setAttribute('content', '#000000');
        }
    }
    
    // Disparar evento para outros componentes (ex: app.js)
    window.dispatchEvent(new Event('themeChanged'));
    
    console.log(`🎨 Tema carregado: ${theme}`);
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
});

// Expor funções globalmente
window.toggleTheme = toggleTheme;
window.loadTheme = loadTheme;
