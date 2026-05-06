// 1. Let the webpage know the extension is active so it can adjust its UI
sessionStorage.setItem('SOLVER_EXTENSION_ACTIVE', 'true');

// 2. Listen for custom event from the React App (Dashboard Side)
window.addEventListener('SOLVER_AUTO_LOGIN_EVENT', (e) => {
  if (e.detail && e.detail.url) {
    // Send message to background script to open tab and save injection data
    chrome.runtime.sendMessage({ action: 'START_AUTO_LOGIN', data: e.detail });
  }
});

// 3. On EVERY page load, check if we have a mission to auto-fill (University Side)
// We use a slight delay to ensure the extension messaging port is fully initialized
setTimeout(() => {
  try {
    chrome.runtime.sendMessage({ action: 'CHECK_PENDING_LOGIN' }, (response) => {
      if (response && response.data) {
        startAutoFillPolling(response.data);
      }
    });
  } catch (err) {
    // Port might be closed or context invalidated, ignore silently
  }
}, 500);

// 4. Polling function to inject credentials when elements appear
function startAutoFillPolling(data) {
  let attempts = 0;
  const maxAttempts = 20; // 20 attempts * 500ms = 10 seconds timeout

  const tryInject = setInterval(() => {
    attempts++;
    let injected = false;
    
    const uField = data.userSelector ? document.querySelector(data.userSelector) : null;
    const pField = data.passSelector ? document.querySelector(data.passSelector) : null;
    
    // Check if at least one of the fields exists
    if (uField || pField) {
      clearInterval(tryInject); // Stop polling once we find the form

      if (uField) {
        uField.value = data.username;
        uField.dispatchEvent(new Event('input', { bubbles: true }));
        uField.dispatchEvent(new Event('change', { bubbles: true }));
        injected = true;
      }
      
      if (pField) {
        pField.value = data.password;
        pField.dispatchEvent(new Event('input', { bubbles: true }));
        pField.dispatchEvent(new Event('change', { bubbles: true }));
        injected = true;
      }
      
      // If we successfully injected the text, click the login button
      if (data.btnSelector && injected) {
        setTimeout(() => {
          const btn = document.querySelector(data.btnSelector);
          if (btn) btn.click();
        }, 800); // Wait 800ms before clicking to ensure frameworks registered the input changes
      }
    } else if (attempts >= maxAttempts) {
      clearInterval(tryInject); // Stop polling after 10 seconds
      console.warn("Auto-login extension timeout: Could not find elements matching selectors:", data.userSelector, data.passSelector);
    }
  }, 500);
}
