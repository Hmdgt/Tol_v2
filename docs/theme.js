// ===============================
// 🎨 SISTEMA DE TEMAS (DARK / LIGHT)
// ===============================

function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  updateThemeUI(newTheme);
  
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', newTheme === 'light' ? '#ffffff' : '#000000');
  }
  
  window.dispatchEvent(new Event('themeChanged'));
  console.log(`🎨 Tema alterado para: ${newTheme}`);
}

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

function loadTheme() {
  // O tema já está definido pelo script inline no <head>
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  updateThemeUI(theme);
  
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000');
  }
  
  window.dispatchEvent(new Event('themeChanged'));
  console.log(`🎨 Tema carregado: ${theme}`);
}

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }
});

window.toggleTheme = toggleTheme;
window.loadTheme = loadTheme;
