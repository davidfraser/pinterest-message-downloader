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

  generateFilename(imageUrl, senderId, messageId, pinId) {
    const extension = this.getImageExtension(imageUrl);
    const identifier = pinId ? `pin_${pinId}` : `msg_${messageId}`;
    return `sender_${senderId}/${messageId}_${identifier}${extension}`;
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
  if (message.type === 'DOWNLOAD_IMAGES') {
    handleDownloadImages(message.images);
    sendResponse({ success: true });
  } else if (message.type === 'GET_LAST_PROCESSED') {
    sendResponse({ lastProcessedMessageId: downloader.lastProcessedMessageId });
  }
});

async function handleDownloadImages(images) {
  const imagesByMonth = {};
  
  for (const img of images) {
    // Skip if already downloaded
    const imageId = `${img.senderId}_${img.messageId}_${img.imageUrl}`;
    if (downloader.downloadedImages.has(imageId)) {
      continue;
    }

    // Download image
    const filename = downloader.generateFilename(img.imageUrl, img.senderId, img.messageId, img.pinId);
    await downloader.downloadImage(img.imageUrl, filename);

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