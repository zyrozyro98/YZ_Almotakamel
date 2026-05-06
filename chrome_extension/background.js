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
      target: { tabId: tabId },
      func: autoFillLogin,
      args: [pendingLoginData[tabId]]
    });
    // Remove it from pending
    delete pendingLoginData[tabId];
  }
});

// This function will be executed inside the university's webpage context
function autoFillLogin(data) {
  try {
    let injected = false;
    
    if (data.userSelector) {
      const uField = document.querySelector(data.userSelector);
      if (uField) {
        uField.value = data.username;
        uField.dispatchEvent(new Event('input', { bubbles: true }));
        uField.dispatchEvent(new Event('change', { bubbles: true }));
        injected = true;
      }
    }
    
    if (data.passSelector) {
      const pField = document.querySelector(data.passSelector);
      if (pField) {
        pField.value = data.password;
        pField.dispatchEvent(new Event('input', { bubbles: true }));
        pField.dispatchEvent(new Event('change', { bubbles: true }));
        injected = true;
      }
    }
    
    if (data.btnSelector && injected) {
      setTimeout(() => {
        const btn = document.querySelector(data.btnSelector);
        if (btn) btn.click();
      }, 500); // Wait 500ms before clicking to ensure frameworks (like React/Angular) registered the input changes
    }
  } catch (err) {
    console.error("Auto-login extension error:", err);
  }
}
