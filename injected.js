// Injected script that runs in the page's context to access the real DOM
(function() {
  'use strict';

  console.log('Pinterest Downloader: Injected script loaded in page context');
  
  // Expose function for popup to call directly
  window.pinterestScanForImages = async function() {
    console.log('Pinterest Downloader: Starting manual scan');
    try {
      const results = await scanForImages('');
      window.dispatchEvent(new CustomEvent('pinterestScanResults', {
        detail: { ...results, triggerDownload: true }
      }));
    } catch (error) {
      console.error('Pinterest Downloader: Error in manual scan:', error);
    }
  };


  async function scanForImages(lastProcessedMessageId) {
    console.log('Pinterest Downloader: Starting scan in page context');
    
    // Now we should be able to see the real DOM
    const elementCount = document.querySelectorAll('*').length;
    const testIdCount = document.querySelectorAll('[data-test-id]').length;
    console.log(`Pinterest Downloader: Page context sees ${elementCount} elements, ${testIdCount} test-ids`);
    
    // Look for messages container
    const messagesContainer = document.querySelector('[data-test-id="messages-container"]');
    if (!messagesContainer) {
      console.log('Pinterest Downloader: No messages container found in page context');
      return { images: [] };
    }

    console.log('Pinterest Downloader: Messages container found in page context');

    // Look for message items
    const messages = messagesContainer.querySelectorAll('[data-test-id="message-item-container"]');
    console.log(`Pinterest Downloader: Found ${messages.length} message containers`);

    const images = [];
    
    for (const message of messages) {
      try {
        const imageData = await extractImageFromMessage(message);
        if (imageData && imageData.messageId !== lastProcessedMessageId) {
          images.push(imageData);
        }
      } catch (error) {
        console.error('Error extracting image from message:', error);
      }
    }

    console.log(`Pinterest Downloader: Found ${images.length} images to process`);
    return { images };
  }

  async function extractImageFromMessage(messageElement) {
    // Look for the specific pin link format
    const pinLink = messageElement.querySelector('a[href*="/pin/"][href*="conversation_id"][href*="message"][href*="sender"]');
    if (!pinLink) {
      return null;
    }

    // Extract data from the link href
    const linkData = extractLinkData(pinLink.href);
    if (!linkData) {
      return null;
    }

    console.log('Pinterest Downloader: Found pin link:', pinLink.href);

    return {
      senderId: linkData.senderId,
      messageId: linkData.messageId,
      conversationId: linkData.conversationId,
      pinId: linkData.pinId,
      pinUrl: pinLink.href,
      // We'll fetch the actual image URL in the background script
      needsImageFetch: true
    };
  }

  function extractLinkData(href) {
    try {
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

})();