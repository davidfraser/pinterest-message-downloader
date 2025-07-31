// Injected script that runs in the page's context to access the real DOM
(function() {
  'use strict';

  console.log('Pinterest Downloader: Injected script loaded in page context');
  
  // Expose function for popup to call directly
  window.pinterestScanForImages = async function() {
    console.log('Pinterest Downloader: Starting manual scan');
    try {
      const results = await scanForImages('');
      // Store results on window for popup to retrieve
      console.log('Pinterest Downloader: Storing results on window for popup to retrieve');
      window.pinterestScanResults = { ...results, triggerDownload: true };
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
    let currentTimestamp = null;
    let currentUsername = null;
    
    for (const message of messages) {
      try {
        // Check if this message container has a timestamp
        const timestampData = extractTimestampFromMessage(message);
        if (timestampData) {
          currentTimestamp = timestampData.timestamp;
          if (timestampData.username) {
            currentUsername = timestampData.username;
          }
          console.log('Pinterest Downloader: Found timestamp:', currentTimestamp, 'username:', currentUsername);
        }
        
        const imageData = await extractImageFromMessage(message);
        if (imageData && imageData.messageId !== lastProcessedMessageId) {
          // Associate current timestamp and username with this image
          imageData.timestamp = currentTimestamp;
          imageData.username = currentUsername;
          console.log('Pinterest Downloader: Added image with timestamp:', currentTimestamp, 'username:', currentUsername, 'messageId:', imageData.messageId);
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

    // Check if this is a video by looking for video elements
    const videoElement = messageElement.querySelector('video');
    const isVideo = videoElement && videoElement.poster;

    if (isVideo) {
      console.log('Pinterest Downloader: Found video with poster:', videoElement.poster);
      return {
        senderId: linkData.senderId,
        messageId: linkData.messageId,
        conversationId: linkData.conversationId,
        pinId: linkData.pinId,
        pinUrl: pinLink.href,
        isVideo: true,
        posterUrl: videoElement.poster,
        needsImageFetch: false // We have the poster URL directly
      };
    } else {
      return {
        senderId: linkData.senderId,
        messageId: linkData.messageId,
        conversationId: linkData.conversationId,
        pinId: linkData.pinId,
        pinUrl: pinLink.href,
        isVideo: false,
        // We'll fetch the actual image URL in the background script
        needsImageFetch: true
      };
    }
  }

  function extractTimestampFromMessage(messageElement) {
    // Look for timestamp and username in text nodes within divs
    let timestamp = null;
    let username = null;
    
    // Find all div elements and check their immediate text content
    const allDivs = messageElement.querySelectorAll('div');
    
    for (const div of allDivs) {
      // Get immediate text content (not from child elements)
      const immediateText = getImmediateTextContent(div);
      
      if (!immediateText || immediateText.length === 0) {
        continue; // Skip empty divs
      }
      
      // Try to extract timestamp from this div
      if (!timestamp && immediateText.length > 0) {
        const extractedTimestamp = extractTimestampFromText(immediateText);
        if (extractedTimestamp) {
          timestamp = extractedTimestamp;
          console.log('Pinterest Downloader: Found timestamp:', immediateText, '->', timestamp);
          continue; // Don't use this div for username
        }
      }
      
      // Try to extract username from this div (if it's not a timestamp)
      if (!username && immediateText.length > 2 && immediateText.length < 50 && !extractTimestampFromText(immediateText)) {
        // Check if it looks like a name (contains letters, no numbers or special chars)
        if (/^[a-zA-Z\s]+$/.test(immediateText) && !/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|at)/i.test(immediateText)) {
          username = immediateText;
          console.log('Pinterest Downloader: Found username:', immediateText);
        }
      }
    }
    
    if (timestamp) {
      return {
        timestamp: timestamp,
        username: username
      };
    }
    
    return null;
  }
  
  function getImmediateTextContent(element) {
    // Get only the immediate text nodes of this element, not from child elements
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }
  
  function extractTimestampFromText(text) {
    // Simple patterns for timestamps only
    const timeOnlyPattern = /^(\d{1,2}):(\d{2})$/; // "19:47"
    const dayTimePattern = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2}):(\d{2})$/; // "Monday 18:48"
    const dateTimePattern = /^(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+at\s+(\d{1,2}):(\d{2})$/; // "22 July at 22:05"
    
    if (timeOnlyPattern.test(text)) {
      const [, hours, minutes] = text.match(timeOnlyPattern);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(minutes));
      
      if (today > now) {
        today.setDate(today.getDate() - 1);
      }
      
      return formatTimestamp(today);
    }
    
    if (dayTimePattern.test(text)) {
      const [, dayName, hours, minutes] = text.match(dayTimePattern);
      const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(dayName);
      
      const now = new Date();
      const currentDay = now.getDay();
      let daysBack = (currentDay - dayIndex + 7) % 7;
      if (daysBack === 0) {
        const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(minutes));
        if (todayTime > now) {
          daysBack = 7;
        }
      }
      
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, parseInt(hours), parseInt(minutes));
      return formatTimestamp(targetDate);
    }
    
    if (dateTimePattern.test(text)) {
      const [, day, monthName, hours, minutes] = text.match(dateTimePattern);
      const monthIndex = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(monthName);
      
      const now = new Date();
      let year = now.getFullYear();
      
      const targetDate = new Date(year, monthIndex, parseInt(day), parseInt(hours), parseInt(minutes));
      if (targetDate > now) {
        year--;
      }
      
      const finalDate = new Date(year, monthIndex, parseInt(day), parseInt(hours), parseInt(minutes));
      return formatTimestamp(finalDate);
    }
    
    return null;
  }
  
  function formatTimestamp(date) {
    // Format as "YYYY-MM-DD HHMM"
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}${minutes}`;
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