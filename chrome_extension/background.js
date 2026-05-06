let pendingLoginData = {};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_AUTO_LOGIN') {
    const { url, username, password, userSelector, passSelector, btnSelector } = request.data;
    
    // Open the new tab
    chrome.tabs.create({ url: url }, (tab) => {
      // Store pending data mapped to both tabId and the exact URL (as fallback for mobile browsers)
      if (tab && tab.id) {
        pendingLoginData[tab.id] = { username, password, userSelector, passSelector, btnSelector };
      }
      pendingLoginData[url] = { username, password, userSelector, passSelector, btnSelector };
      
      // Auto-cleanup after 30 seconds to prevent memory leaks
      setTimeout(() => {
        if (tab && tab.id) delete pendingLoginData[tab.id];
        delete pendingLoginData[url];
      }, 30000);
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'CHECK_PENDING_LOGIN') {
    const tabId = sender.tab ? sender.tab.id : null;
    const url = sender.tab ? sender.tab.url : null;
    
    let data = null;
    // Check if we have data for this tab ID
    if (tabId && pendingLoginData[tabId]) {
      data = pendingLoginData[tabId];
      delete pendingLoginData[tabId]; // Consume it
    } 
    // Fallback: Check if we have data for this URL (common on mobile browsers where tab IDs might shift)
    else if (url && pendingLoginData[url]) {
      data = pendingLoginData[url];
      delete pendingLoginData[url]; // Consume it
    }
    
    sendResponse({ data: data });
    return true;
  }
});
