// Background service worker for Pinterest Image Downloader
class PinterestDownloader {
  constructor() {
    this.downloadedImages = new Set();
    this.initializeStorage();
  }

  async initializeStorage() {
    const result = await chrome.storage.local.get(['downloadedImages', 'lastProcessedMessageId']);
    this.downloadedImages = new Set(result.downloadedImages || []);
    this.lastProcessedMessageId = result.lastProcessedMessageId || '';
  }

  async saveProgress(imageId, messageId) {
    this.downloadedImages.add(imageId);
    this.lastProcessedMessageId = messageId;
    
    await chrome.storage.local.set({
      downloadedImages: Array.from(this.downloadedImages),
      lastProcessedMessageId: this.lastProcessedMessageId
    });
  }

  generateFilename(imageUrl, senderId, messageId, pinId, timestamp, isVideo = false, username = null) {
    const extension = this.getImageExtension(imageUrl);
    const identifier = pinId ? `pin_${pinId}` : `msg_${messageId}`;
    const timestampPrefix = timestamp ? `${timestamp} ` : '';
    const videoPrefix = isVideo ? 'video ' : '';
    const usernamePrefix = username ? `${this.sanitizeUsername(username)} ` : '';
    return `Pinterest-messages-from-${senderId}/${timestampPrefix}${usernamePrefix}${videoPrefix}${messageId}_${identifier}${extension}`;
  }

  sanitizeUsername(username) {
    // Remove invalid filename characters and limit length
    return username.replace(/[<>:"/\\|?*]/g, '_').substring(0, 30);
  }

  getImageExtension(url) {
    const match = url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
    return match ? `.${match[1].toLowerCase()}` : '.jpg';
  }

  async downloadImage(imageUrl, filename) {
    try {
      const downloadId = await chrome.downloads.download({
        url: imageUrl,
        filename: filename,
        conflictAction: 'uniquify'
      });
      return downloadId;
    } catch (error) {
      console.error('Download failed:', error);
      return null;
    }
  }

  async createVideoRedirectHtml(pinUrl, filename) {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pinterest Video Redirect</title>
    <script>
        // Redirect to the Pinterest video pin page
        window.location.href = "${pinUrl}";
    </script>
</head>
<body>
    <p>Redirecting to Pinterest video...</p>
    <p>If you are not redirected automatically, <a href="${pinUrl}">click here</a>.</p>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    try {
      const htmlFilename = filename.replace(/\.[^.]+$/, '.html');
      await chrome.downloads.download({
        url: url,
        filename: htmlFilename,
        conflictAction: 'uniquify'
      });
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to create HTML redirect:', error);
      URL.revokeObjectURL(url);
    }
  }

  async saveMonthlyHtml(images, year, month) {
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const filename = `pinterest_pins_${year}_${month.toString().padStart(2, '0')}_${monthName}.html`;
    
    const html = this.generateHtmlContent(images, year, month);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    try {
      await chrome.downloads.download({
        url: url,
        filename: filename,
        conflictAction: 'overwrite'
      });
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to save HTML:', error);
      URL.revokeObjectURL(url);
    }
  }

  generateHtmlContent(images, year, month) {
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pinterest Pins - ${monthName} ${year}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { text-align: center; margin-bottom: 30px; }
        .pin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
        .pin-card { 
            background: white; 
            border-radius: 8px; 
            box-shadow: 0 2px 8px rgba(0,0,0,0.1); 
            overflow: hidden;
            transition: transform 0.2s;
        }
        .pin-card:hover { transform: translateY(-2px); }
        .pin-image { width: 100%; height: 200px; object-fit: cover; }
        .pin-info { padding: 15px; }
        .pin-sender { font-weight: bold; color: #e60023; margin-bottom: 5px; }
        .pin-date { color: #666; font-size: 0.9em; margin-bottom: 10px; }
        .pin-link { 
            color: #0073e6; 
            text-decoration: none; 
            font-weight: bold;
            display: inline-block;
            margin-top: 5px;
        }
        .pin-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Pinterest Pins - ${monthName} ${year}</h1>
        <p>Downloaded images and pin links from Pinterest messages</p>
    </div>
    <div class="pin-grid">
        ${images.map(img => `
            <div class="pin-card">
                <img src="${img.imageUrl}" alt="Pinterest Pin" class="pin-image" loading="lazy">
                <div class="pin-info">
                    <div class="pin-sender">From: Sender ${img.senderId}</div>
                    <div class="pin-date">Message: ${img.messageId}</div>
                    ${img.pinUrl ? `<a href="${img.pinUrl}" target="_blank" class="pin-link">View Original Pin</a>` : ''}
                </div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;
  }
}

const downloader = new PinterestDownloader();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: Received message:', message.type, message);
  
  if (message.type === 'DOWNLOAD_IMAGES') {
    handleDownloadImages(message.images);
    sendResponse({ success: true });
  } else if (message.type === 'GET_LAST_PROCESSED') {
    sendResponse({ lastProcessedMessageId: downloader.lastProcessedMessageId });
  } else if (message.type === 'FETCH_PIN_IMAGE') {
    console.log('Background: Handling FETCH_PIN_IMAGE for:', message.pinUrl);
    handleFetchPinImage(message.pinUrl).then(result => {
      console.log('Background: Sending response:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('Background: Error fetching pin image:', error);
      sendResponse({ error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
});

async function handleFetchPinImage(pinUrl) {
  try {
    console.log('Background: Fetching pin page:', pinUrl);
    
    // Convert relative URL to absolute if needed
    const fullUrl = pinUrl.startsWith('http') ? pinUrl : `https://pinterest.com${pinUrl}`;
    
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      console.error('Background: Failed to fetch pin page:', response.status);
      return { error: `HTTP ${response.status}` };
    }
    
    const html = await response.text();
    
    // Use regex to find image URLs since DOMParser isn't available in service workers
    const imageUrl = extractImageFromHtml(html);
    
    if (imageUrl) {
      console.log('Background: Found main image:', imageUrl);
      return { 
        imageUrl: getHighResImageUrl(imageUrl) 
      };
    } else {
      console.log('Background: No image found in HTML');
      return { error: 'No image found in HTML' };
    }
    
  } catch (error) {
    console.error('Background: Error fetching pin image:', error);
    return { error: error.message };
  }
}

function extractImageFromHtml(html) {
  // Try multiple regex patterns to find the main Pinterest image
  const patterns = [
    // Look for images in closeup-image divs
    /<div[^>]*data-test-id="closeup-image"[^>]*>[\s\S]*?<img[^>]*src="([^"]*pinimg\.com[^"]*)"[^>]*>/i,
    
    // Look for images in presentation divs
    /<div[^>]*role="presentation"[^>]*>[\s\S]*?<img[^>]*src="([^"]*pinimg\.com[^"]*)"[^>]*>/i,
    
    // Look for pin-closeup-image
    /<img[^>]*data-test-id="pin-closeup-image"[^>]*src="([^"]*pinimg\.com[^"]*)"[^>]*>/i,
    
    // Look for any large Pinterest image (originals or 736x)
    /<img[^>]*src="([^"]*pinimg\.com[^"]*(?:originals|736x)[^"]*)"[^>]*>/i,
    
    // Look for any Pinterest image with reasonable size
    /<img[^>]*src="([^"]*pinimg\.com[^"]*\d{3,4}x[^"]*)"[^>]*>/i,
    
    // Fallback: any Pinterest image
    /<img[^>]*src="([^"]*pinimg\.com[^"]*)"[^>]*>/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      console.log('Background: Found image with pattern:', pattern.toString().substring(0, 50) + '...');
      return match[1];
    }
  }
  
  return null;
}

function getHighResImageUrl(imageSrc) {
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

async function handleDownloadImages(images) {
  console.log('Background: Starting download of', images.length, 'images');
  const imagesByMonth = {};
  
  for (const img of images) {
    // Skip if already downloaded
    const imageId = `${img.senderId}_${img.messageId}_${img.imageUrl}`;
    console.log('Background: Checking if already downloaded:', imageId, 'exists:', downloader.downloadedImages.has(imageId));
    if (downloader.downloadedImages.has(imageId)) {
      console.log('Background: Skipping already downloaded image:', imageId);
      continue;
    }

    // Download image (or poster for video)
    const filename = downloader.generateFilename(img.imageUrl, img.senderId, img.messageId, img.pinId, img.timestamp, img.isVideo, img.username);
    console.log('Background: Downloading with timestamp:', img.timestamp, 'username:', img.username, 'filename:', filename);
    await downloader.downloadImage(img.imageUrl, filename);

    // For videos, also create an HTML redirect file
    if (img.isVideo && img.pinUrl) {
      await downloader.createVideoRedirectHtml(img.pinUrl, filename);
    }

    // Group by month for HTML generation (using current date since we don't have message timestamp)
    const date = new Date();
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    
    if (!imagesByMonth[monthKey]) {
      imagesByMonth[monthKey] = [];
    }
    imagesByMonth[monthKey].push(img);

    // Save progress
    await downloader.saveProgress(imageId, img.messageId);
  }

  // Generate monthly HTML files
  for (const [monthKey, monthImages] of Object.entries(imagesByMonth)) {
    const [year, month] = monthKey.split('-').map(Number);
    await downloader.saveMonthlyHtml(monthImages, year, month);
  }
}