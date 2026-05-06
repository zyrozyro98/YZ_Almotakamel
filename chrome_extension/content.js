// Let the webpage know the extension is active so it can adjust its UI
sessionStorage.setItem('SOLVER_EXTENSION_ACTIVE', 'true');

// Listen for custom event from the React App
window.addEventListener('SOLVER_AUTO_LOGIN_EVENT', (e) => {
  if (e.detail && e.detail.url) {
    // Send message to background script to open tab and inject
    chrome.runtime.sendMessage({ action: 'START_AUTO_LOGIN', data: e.detail });
  }
});
