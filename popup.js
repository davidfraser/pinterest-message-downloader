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
    scanButton.disabled = true;
    scanButton.textContent = 'Scanning...';

    try {
      // Inject content script to trigger scan
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: triggerManualScan
      });

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
      const data = await chrome.storage.local.get(['downloadedImages', 'lastProcessedTimestamp']);
      const images = data.downloadedImages || [];
      downloadCount.textContent = images.length.toString();
      
      if (data.lastProcessedTimestamp) {
        const date = new Date(data.lastProcessedTimestamp);
        lastScan.textContent = date.toLocaleString();
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  // Function to be injected into the page
  function triggerManualScan() {
    // Dispatch a custom event to trigger manual scan
    window.dispatchEvent(new CustomEvent('pinterestManualScan'));
  }
});

// Listen for storage changes to update stats
chrome.storage.onChanged.addListener((changes) => {
  if (changes.downloadedImages) {
    const count = changes.downloadedImages.newValue?.length || 0;
    document.getElementById('downloadCount').textContent = count.toString();
  }
  
  if (changes.lastProcessedTimestamp && changes.lastProcessedTimestamp.newValue) {
    const date = new Date(changes.lastProcessedTimestamp.newValue);
    document.getElementById('lastScan').textContent = date.toLocaleString();
  }
});