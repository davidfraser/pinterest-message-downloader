// Content script for Pinterest Image Downloader
class PinterestMessageParser {
  constructor() {
    this.isProcessing = false;
    this.lastProcessedMessageId = '';
    this.autoDownload = false; // Only download when user clicks button
    
    // Listen for results from the injected script
    window.addEventListener('pinterestScanResults', (event) => {
      this.handleScanResults(event.detail);
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
    if (results.error) {
      console.error('Pinterest Downloader: Error from injected script:', results.error);
      return;
    }

    // If this came from a manual scan trigger, enable auto download
    if (results.triggerDownload) {
      this.autoDownload = true;
    }

    if (results.images && results.images.length > 0 && this.autoDownload) {
      // For each image that needs fetching, get the actual image URL
      const processedImages = [];
      
      for (const img of results.images) {
        if (img.needsImageFetch) {
          const imageUrl = await this.fetchMainImageFromPin(img.pinUrl);
          if (imageUrl) {
            processedImages.push({
              ...img,
              imageUrl: imageUrl
            });
          }
        } else {
          processedImages.push(img);
        }
      }

      if (processedImages.length > 0) {
        await chrome.runtime.sendMessage({
          type: 'DOWNLOAD_IMAGES',
          images: processedImages
        });
        
        console.log(`Pinterest Downloader: Downloaded ${processedImages.length} new images`);
      }
      
      this.autoDownload = false;
    }
  }

  async fetchMainImageFromPin(pinUrl) {
    try {
      console.log('Pinterest Downloader: Requesting main image for:', pinUrl);
      
      // Send request to background script to fetch the pin page
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_PIN_IMAGE',
        pinUrl: pinUrl
      });
      
      if (response && response.imageUrl) {
        console.log('Pinterest Downloader: Received main image URL:', response.imageUrl);
        return response.imageUrl;
      } else {
        console.log('Pinterest Downloader: No image URL received from background');
        return null;
      }
      
    } catch (error) {
      console.error('Pinterest Downloader: Error requesting main image:', error);
      return null;
    }
  }
}


// Initialize the parser when the script loads
new PinterestMessageParser();