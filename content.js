// Content script for Pinterest Image Downloader
class PinterestMessageParser {
  constructor() {
    this.isProcessing = false;
    this.observer = null;
    this.lastProcessedMessageId = '';
    this.autoDownload = false; // Only download when user clicks button
    this.init();
  }

  async init() {
    // Get last processed message ID from background
    const response = await chrome.runtime.sendMessage({ type: 'GET_LAST_PROCESSED' });
    this.lastProcessedMessageId = response.lastProcessedMessageId || '';
    
    // Listen for manual scan trigger from popup
    window.addEventListener('pinterestManualScan', () => {
      this.autoDownload = true;
      this.processMessages();
    });
    
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
    // Look specifically for the messages-container as specified
    this.messagesContainer = document.querySelector('[data-test-id="messages-container"]');
    
    if (!this.messagesContainer) {
      console.log('Pinterest Downloader: messages-container not found');
    }
  }

  async processMessages() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const images = await this.extractImages();
      
      if (images.length > 0) {
        // Filter out already processed images based on message ID
        const newImages = images.filter(img => img.messageId !== this.lastProcessedMessageId);
        
        if (newImages.length > 0 && this.autoDownload) {
          await chrome.runtime.sendMessage({
            type: 'DOWNLOAD_IMAGES',
            images: newImages
          });
          
          console.log(`Pinterest Downloader: Downloaded ${newImages.length} new images`);
          this.autoDownload = false; // Reset after download
        } else if (newImages.length > 0) {
          console.log(`Pinterest Downloader: Found ${newImages.length} new images (waiting for user to click download)`);
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
    
    if (!this.messagesContainer) {
      console.log('Pinterest Downloader: No messages container found');
      return images;
    }

    // Look specifically for message-item-container elements
    const messages = this.messagesContainer.querySelectorAll('[data-test-id="message-item-container"]');
    
    if (messages.length === 0) {
      console.log('Pinterest Downloader: No message-item-container elements found');
      return images;
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

    return images; // Don't sort, keep original order
  }

  async extractImageFromMessage(messageElement) {
    // Look for the specific pin link format with sender and message info
    const pinLink = messageElement.querySelector('a[href*="/pin/"][href*="conversation_id"][href*="message"][href*="sender"]');
    if (!pinLink) {
      console.log('Pinterest Downloader: No valid pin link found in message');
      return null;
    }

    // Extract data from the link href
    const linkData = this.extractLinkData(pinLink.href);
    if (!linkData) {
      console.log('Pinterest Downloader: Could not extract link data');
      return null;
    }

    // Get the main image URL by fetching the pin page
    const imageUrl = await this.fetchMainImageFromPin(pinLink.href);
    if (!imageUrl) {
      console.log('Pinterest Downloader: Could not fetch main image from pin page');
      return null;
    }

    return {
      imageUrl,
      senderId: linkData.senderId,
      messageId: linkData.messageId,
      conversationId: linkData.conversationId,
      pinId: linkData.pinId,
      pinUrl: pinLink.href
    };
  }

  extractLinkData(href) {

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
    try {
      // Parse URL to extract parameters
      const url = new URL(href, 'https://pinterest.com');
      const pathMatch = url.pathname.match(/\/pin\/(\d+)/);
      const searchParams = new URLSearchParams(url.search);
      
      if (!pathMatch) return null;
      
      return {
        pinId: pathMatch[1],
        conversationId: searchParams.get('conversation_id'),
        messageId: searchParams.get('message'),
        senderId: searchParams.get('sender')
      };
    } catch (error) {
      console.error('Error parsing link data:', error);
      return null;
    }
}

// Initialize the parser when the script loads
new PinterestMessageParser();