// Content script for Pinterest Image Downloader
class PinterestMessageParser {
  constructor() {
    this.isProcessing = false;
    this.observer = null;
    this.lastProcessedTimestamp = 0;
    this.init();
  }

  async init() {
    // Get last processed timestamp from background
    const response = await chrome.runtime.sendMessage({ type: 'GET_LAST_PROCESSED' });
    this.lastProcessedTimestamp = response.lastProcessedTimestamp || 0;
    
    // Wait for page to load completely
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.startObserving());
    } else {
      this.startObserving();
    }
  }

  startObserving() {
    // Look for Pinterest messages interface
    this.findMessagesContainer();
    
    // Set up mutation observer to detect new messages
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          this.debounceProcessMessages();
        }
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial scan
    this.debounceProcessMessages();
  }

  debounceProcessMessages() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.processMessages();
    }, 1000);
  }

  findMessagesContainer() {
    // Pinterest messages might be in various containers
    const possibleSelectors = [
      '[data-test-id="messages-container"]',
      '[data-test-id="conversation-messages"]',
      '.messages-container',
      '.conversation-messages',
      '[role="main"] [role="log"]'
    ];

    for (const selector of possibleSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        this.messagesContainer = container;
        break;
      }
    }
  }

  async processMessages() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const images = await this.extractImages();
      
      if (images.length > 0) {
        // Filter out already processed images
        const newImages = images.filter(img => img.timestamp > this.lastProcessedTimestamp);
        
        if (newImages.length > 0) {
          await chrome.runtime.sendMessage({
            type: 'DOWNLOAD_IMAGES',
            images: newImages
          });
          
          console.log(`Pinterest Downloader: Found ${newImages.length} new images to download`);
        }
      }
    } catch (error) {
      console.error('Pinterest Downloader error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async extractImages() {
    const images = [];
    
    // Look for message elements - Pinterest uses various selectors
    const messageSelectors = [
      '[data-test-id="message"]',
      '[data-test-id="pin-message"]',
      '.message',
      '.pin-message',
      '[role="listitem"]'
    ];

    let messages = [];
    for (const selector of messageSelectors) {
      messages = document.querySelectorAll(selector);
      if (messages.length > 0) break;
    }

    for (const message of messages) {
      try {
        const imageData = await this.extractImageFromMessage(message);
        if (imageData) {
          images.push(imageData);
        }
      } catch (error) {
        console.error('Error extracting image from message:', error);
      }
    }

    return images.sort((a, b) => b.timestamp - a.timestamp); // Newest first
  }

  async extractImageFromMessage(messageElement) {
    // Look for images in the message
    const img = messageElement.querySelector('img');
    if (!img || !img.src) return null;

    // Skip profile pictures and UI elements
    if (this.isUIImage(img)) return null;

    // Extract sender information
    const sender = this.extractSender(messageElement);
    if (!sender) return null;

    // Extract timestamp
    const timestamp = this.extractTimestamp(messageElement);
    
    // Look for pin URL
    const pinUrl = this.extractPinUrl(messageElement);
    
    // Extract pin ID from URL or image source
    const pinId = this.extractPinId(pinUrl || img.src);

    // Get high-resolution image URL
    const imageUrl = this.getHighResImageUrl(img.src);

    return {
      imageUrl,
      sender: this.sanitizeSender(sender),
      timestamp,
      pinUrl,
      pinId
    };
  }

  isUIImage(img) {
    const src = img.src.toLowerCase();
    const classes = img.className.toLowerCase();
    
    // Skip profile pictures, avatars, icons, etc.
    return (
      src.includes('avatar') ||
      src.includes('profile') ||
      classes.includes('avatar') ||
      classes.includes('profile') ||
      img.width < 50 ||
      img.height < 50
    );
  }

  extractSender(messageElement) {
    // Look for sender name in various possible locations
    const senderSelectors = [
      '[data-test-id="sender-name"]',
      '.sender-name',
      '.message-sender',
      '.username',
      'h3',
      'h4',
      '[role="heading"]'
    ];

    for (const selector of senderSelectors) {
      const element = messageElement.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    // Try to find sender in parent elements
    let parent = messageElement.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      for (const selector of senderSelectors) {
        const element = parent.querySelector(selector);
        if (element && element.textContent.trim()) {
          return element.textContent.trim();
        }
      }
      parent = parent.parentElement;
    }

    return 'Unknown';
  }

  extractTimestamp(messageElement) {
    // Look for timestamp elements
    const timeSelectors = [
      'time',
      '[datetime]',
      '.timestamp',
      '.message-time',
      '[data-test-id="timestamp"]'
    ];

    for (const selector of timeSelectors) {
      const element = messageElement.querySelector(selector);
      if (element) {
        const datetime = element.getAttribute('datetime') || element.textContent;
        const timestamp = new Date(datetime).getTime();
        if (!isNaN(timestamp)) {
          return timestamp;
        }
      }
    }

    // Fallback to current time if no timestamp found
    return Date.now();
  }

  extractPinUrl(messageElement) {
    // Look for Pinterest pin links
    const links = messageElement.querySelectorAll('a[href*="pinterest.com/pin/"]');
    if (links.length > 0) {
      return links[0].href;
    }

    // Check parent elements for pin links
    let parent = messageElement.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const links = parent.querySelectorAll('a[href*="pinterest.com/pin/"]');
      if (links.length > 0) {
        return links[0].href;
      }
      parent = parent.parentElement;
    }

    return null;
  }

  extractPinId(urlOrSrc) {
    if (!urlOrSrc) return null;
    
    // Extract pin ID from Pinterest URL
    const pinMatch = urlOrSrc.match(/pin\/(\d+)/);
    if (pinMatch) {
      return pinMatch[1];
    }

    // Extract ID from image URL
    const idMatch = urlOrSrc.match(/(\d+)x/);
    if (idMatch) {
      return idMatch[1];
    }

    return null;
  }

  getHighResImageUrl(imageSrc) {
    // Convert Pinterest image URLs to highest resolution
    if (imageSrc.includes('pinimg.com')) {
      // Replace size parameters with originals for best quality
      return imageSrc
        .replace(/\/\d+x\d+\//, '/originals/')
        .replace(/\/\d+x\//, '/originals/')
        .replace(/_\d+x\d+\./, '_originals.');
    }
    
    return imageSrc;
  }

  sanitizeSender(sender) {
    // Remove invalid filename characters
    return sender.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
  }
}

// Initialize the parser when the script loads
new PinterestMessageParser();