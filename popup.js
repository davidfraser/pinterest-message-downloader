// Popup script for Pinterest Image Downloader
document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const scanButton = document.getElementById('scanButton');
  const clearButton = document.getElementById('clearButton');
  const downloadCount = document.getElementById('downloadCount');
  const lastScan = document.getElementById('lastScan');

  // Check if we're on Pinterest
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isPinterest = tab.url && tab.url.includes('pinterest.com');

  if (isPinterest) {
    statusDiv.textContent = 'Status: Active on Pinterest';
    statusDiv.className = 'status active';
    scanButton.disabled = false;
  } else {
    statusDiv.textContent = 'Status: Not on Pinterest';
    statusDiv.className = 'status inactive';
    scanButton.disabled = true;
  }

  // Load statistics
  await loadStats();

  // Scan button handler
  scanButton.addEventListener('click', async () => {
    console.log('Pinterest Downloader: Scan button clicked');
    scanButton.disabled = true;
    scanButton.textContent = 'Scanning...';

    try {
      // Execute script in page context to trigger scan
      console.log('Pinterest Downloader: Executing script to trigger scan');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => {
          console.log('Pinterest Downloader: Triggering manual scan');
          
          // Call the injected script function directly
          if (typeof window.pinterestScanForImages === 'function') {
            window.pinterestScanForImages();
            
            // Wait a bit for scan to complete, then retrieve results
            setTimeout(() => {
              if (window.pinterestScanResults) {
                console.log('Pinterest Downloader: Retrieved scan results, sending to content script');
                // Send results back to popup for processing
                window.pinterestPopupResults = window.pinterestScanResults;
                window.pinterestScanResults = null; // Clear after use
              } else {
                console.log('Pinterest Downloader: No scan results found');
              }
            }, 1000);
          } else {
            console.error('Pinterest Downloader: Scan function not available - extension may need to be reloaded');
          }
        }
      });

      // Wait for scan to complete, then retrieve results and send to content script
      setTimeout(async () => {
        try {
          console.log('Pinterest Downloader: Retrieving scan results');
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: 'MAIN',
            func: () => {
              const results = window.pinterestPopupResults;
              window.pinterestPopupResults = null; // Clear after retrieval
              return results;
            }
          });

          if (results[0]?.result) {
            console.log('Pinterest Downloader: Sending results to content script');
            await chrome.tabs.sendMessage(tab.id, {
              type: 'PROCESS_SCAN_RESULTS',
              results: results[0].result
            });
          }
        } catch (error) {
          console.error('Pinterest Downloader: Error retrieving results:', error);
        }
      }, 1500);

      scanButton.textContent = 'Scan Complete';
      setTimeout(() => {
        scanButton.textContent = 'Scan for New Images';
        scanButton.disabled = false;
      }, 2000);

      // Refresh stats
      setTimeout(loadStats, 1000);
    } catch (error) {
      console.error('Scan failed:', error);
      scanButton.textContent = 'Scan Failed';
      setTimeout(() => {
        scanButton.textContent = 'Scan for New Images';
        scanButton.disabled = false;
      }, 2000);
    }
  });

  // Clear button handler
  clearButton.addEventListener('click', async () => {
    if (confirm('Clear all download history? This will not delete downloaded files.')) {
      await chrome.storage.local.clear();
      downloadCount.textContent = '0';
      lastScan.textContent = 'Never';
    }
  });

  async function loadStats() {
    try {
      const data = await chrome.storage.local.get(['downloadedImages', 'lastProcessedMessageId']);
      const images = data.downloadedImages || [];
      downloadCount.textContent = images.length.toString();
      
      if (data.lastProcessedMessageId) {
        lastScan.textContent = `Message ID: ${data.lastProcessedMessageId}`;
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

});

// Listen for storage changes to update stats
chrome.storage.onChanged.addListener((changes) => {
  if (changes.downloadedImages) {
    const count = changes.downloadedImages.newValue?.length || 0;
    document.getElementById('downloadCount').textContent = count.toString();
  }
  
  if (changes.lastProcessedMessageId && changes.lastProcessedMessageId.newValue) {
    const messageId = changes.lastProcessedMessageId.newValue;
    document.getElementById('lastScan').textContent = `Message ID: ${messageId}`;
  }
});