let pendingLoginData = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_AUTO_LOGIN') {
    const { url, username, password, userSelector, passSelector, btnSelector } = request.data;
    
    // Open the new tab
    chrome.tabs.create({ url: url }, (tab) => {
      // Store the pending data mapped to the tab ID
      pendingLoginData[tab.id] = { username, password, userSelector, passSelector, btnSelector };
    });
  }
});

// Listen for tab updates to see when the target page finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && pendingLoginData[tabId]) {
    // Inject the auto-fill script into the university page
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      func: autoFillLogin,
      args: [pendingLoginData[tabId]]
    });
    // Remove it from pending
    delete pendingLoginData[tabId];
  }
});

// This function will be executed inside the university's webpage context
function autoFillLogin(data) {
  // Use a polling mechanism because modern websites (React/Angular) might load the DOM *after* the page is 'complete'
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
      
      if (data.btnSelector && injected) {
        setTimeout(() => {
          const btn = document.querySelector(data.btnSelector);
          if (btn) btn.click();
        }, 800); // Wait 800ms before clicking to ensure frameworks (like React/Angular) registered the input changes
      }
    } else if (attempts >= maxAttempts) {
      clearInterval(tryInject); // Stop polling after 10 seconds
      console.warn("Auto-login extension timeout: Could not find elements matching selectors:", data.userSelector, data.passSelector);
    }
  }, 500);
}
