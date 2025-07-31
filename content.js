// Content script for Pinterest Image Downloader
class PinterestMessageParser {
  constructor() {
    this.isProcessing = false;
    this.lastProcessedMessageId = '';
    this.autoDownload = false; // Only download when user clicks button
    
    // Listen for messages from popup with scan results
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PROCESS_SCAN_RESULTS') {
        console.log('Pinterest Downloader: Received scan results from popup');
        this.handleScanResults(message.results);
        sendResponse({ success: true });
      }
    });
    
    this.init();
  }

  async init() {
    // Get last processed message ID from background
    const response = await chrome.runtime.sendMessage({ type: 'GET_LAST_PROCESSED' });
    this.lastProcessedMessageId = response.lastProcessedMessageId || '';
    
    
    // Inject script into page context to access the real DOM (but don't scan yet)
    this.injectPageScript();
  }

  injectPageScript() {
    // Inject a script that runs in the page's context, not the content script's isolated context
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    // Don't remove the script - we need it to stay and listen for events
    (document.head || document.documentElement).appendChild(script);
  }


  async handleScanResults(results) {
    console.log('Pinterest Downloader: Content script received scan results:', results);
    
    if (results.error) {
      console.error('Pinterest Downloader: Error from injected script:', results.error);
      return;
    }

    // If this came from a manual scan trigger, enable auto download
    if (results.triggerDownload) {
      console.log('Pinterest Downloader: Enabling auto download');
      this.autoDownload = true;
    }

    console.log('Pinterest Downloader: autoDownload =', this.autoDownload, 'images count =', results.images?.length);

    if (results.images && results.images.length > 0 && this.autoDownload) {
      console.log('Pinterest Downloader: Processing images for download');
      // For each image that needs fetching, get the actual image URL
      const processedImages = [];
      
      // Process all pins with parallel fetching (video detection happens in background)
      const imagePromises = results.images.map(async (img, index) => {
        const pinNumber = index + 1;
        img.pinNumber = pinNumber;
        
        if (img.needsImageFetch) {
          const result = await this.fetchMainImageFromPin(img.pinUrl, pinNumber);
          if (result) {
            return {
              ...img,
              ...result // This will include imageUrl and isVideo flag from background
            };
          }
        } else {
          return img;
        }
        return null;
      });
      
      const fetchedImages = await Promise.all(imagePromises);
      const validImages = fetchedImages.filter(img => img !== null);
      processedImages.push(...validImages);

      if (processedImages.length > 0) {
        // Add pin numbers to images
        processedImages.forEach((img, index) => {
          img.pinNumber = index + 1;
        });
        
        await chrome.runtime.sendMessage({
          type: 'DOWNLOAD_IMAGES',
          images: processedImages
        });
      }
      
      this.autoDownload = false;
    }
  }

  async fetchMainImageFromPin(pinUrl, pinNumber) {
    try {
      console.log(`Pinterest Downloader: Pin ${pinNumber} requesting main image for:`, pinUrl);
      
      // Send request to background script to fetch the pin page
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_PIN_IMAGE',
        pinUrl: pinUrl,
        pinNumber: pinNumber
      });
      
      
      if (response && response.imageUrl) {
        console.log(`Pinterest Downloader: Pin ${pinNumber} received main image URL:`, response.imageUrl);
        return response.imageUrl;
      } else if (response && response.error) {
        console.error(`Pinterest Downloader: Pin ${pinNumber} background error: ${response.error}`);
        return null;
      } else {
        console.error(`Pinterest Downloader: Pin ${pinNumber} no image URL received from background for: ${pinUrl}`, response);
        return null;
      }
      
    } catch (error) {
      console.error(`Pinterest Downloader: Pin ${pinNumber} error requesting main image for ${pinUrl}:`, error);
      return null;
    }
  }
}


// Initialize the parser when the script loads
new PinterestMessageParser();