// Loom Chrome Extension Background Script (MV3)
// Acts as an API request relay to bypass CSP restrictions on github.com
// and handles the GitHub OAuth login flow completion state.

let oauthTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 1. API request relay
  if (msg.type === 'API_REQUEST') {
    const backendUrl = msg.backendUrl || `http://localhost:8000${msg.path}`;
    
    const fetchOptions = {
      method: msg.method || 'GET',
      credentials: 'include', // Crucial: forces JWT httpOnly cookies to be sent
      headers: {
        'Content-Type': 'application/json',
        ...msg.headers
      }
    };
    
    if (msg.body) {
      fetchOptions.body = JSON.stringify(msg.body);
    }

    fetch(backendUrl, fetchOptions)
      .then(async (response) => {
        const text = await response.text();
        let data = {};
        try {
          data = JSON.parse(text);
        } catch (e) {
          data = { error: "Failed to parse JSON response", detail: text };
        }
        
        return {
          ok: response.ok,
          status: response.status,
          data: data
        };
      })
      .then((result) => {
        sendResponse({ success: true, result: result });
      })
      .catch((err) => {
        console.error("API Request relay failed:", err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Keep the message channel open for async response
  }

  // 2. Register OAuth tab ID
  if (msg.type === 'REGISTER_OAUTH_TAB') {
    oauthTabId = msg.tabId;
    sendResponse({ success: true });
    return false;
  }
});

// 3. Monitor tab closure for OAuth callback completes
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === oauthTabId) {
    oauthTabId = null;
    console.log("Loom OAuth login tab closed. Notifying active content scripts to refresh auth...");
    
    // Query and notify all GitHub tabs
    chrome.tabs.query({ url: "https://github.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'AUTH_UPDATED' })
            .catch(err => console.debug("Tab notification skipped:", err.message));
        });
      }
    });
  }
});
