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
    return `pinterest-messages/from-${senderId}/${timestampPrefix}${usernamePrefix}${videoPrefix}${messageId}_${identifier}${extension}`;
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

    // Convert HTML string to data URL (works in service workers)
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent);
    
    try {
      const htmlFilename = filename.replace(/\.[^.]+$/, '.html');
      await chrome.downloads.download({
        url: dataUrl,
        filename: htmlFilename,
        conflictAction: 'uniquify'
      });
    } catch (error) {
      console.error('Failed to create HTML redirect:', error);
    }
  }

  async ensurePhotosSwipeFiles() {
    // Download PhotoSwipe files if they don't exist
    const files = [
      {
        url: 'https://cdn.jsdelivr.net/npm/photoswipe@5.4.2/dist/photoswipe.css',
        filename: 'pinterest-messages/js/photoswipe.css'
      },
      {
        url: 'https://cdn.jsdelivr.net/npm/photoswipe@5.4.2/dist/umd/photoswipe.umd.min.js',
        filename: 'pinterest-messages/js/photoswipe.umd.min.js'
      },
      {
        url: 'https://cdn.jsdelivr.net/npm/photoswipe@5.4.2/dist/umd/photoswipe-lightbox.umd.min.js',
        filename: 'pinterest-messages/js/photoswipe-lightbox.umd.min.js'
      }
    ];

    for (const file of files) {
      try {
        await chrome.downloads.download({
          url: file.url,
          filename: file.filename,
          conflictAction: 'overwrite'
        });
      } catch (error) {
        console.log(`PhotoSwipe file ${file.filename} download skipped (may already exist):`, error.message);
      }
    }
  }

  async saveMonthlyHtml(images, year, month) {
    // Ensure PhotoSwipe files are downloaded first
    await this.ensurePhotosSwipeFiles();
    
    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const filename = `pinterest-messages/pinterest_pins_${year}_${month.toString().padStart(2, '0')}_${monthName}.html`;
    
    const html = this.generateHtmlContent(images, year, month);
    
    // Convert HTML string to data URL (works in service workers)
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    
    try {
      await chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        conflictAction: 'overwrite'
      });
    } catch (error) {
      console.error('Failed to save HTML:', error);
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
    
    <!-- PhotoSwipe CSS -->
    <link rel="stylesheet" href="js/photoswipe.css">
    
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
        .pin-image-container { 
            position: relative; 
            cursor: pointer;
            display: block;
            text-decoration: none;
        }
        .pin-image { width: 100%; height: 200px; object-fit: cover; }
        .video-overlay {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 60px;
            height: 60px;
            background: rgba(0,0,0,0.7);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
        }
        .video-overlay:hover {
            background: rgba(0,0,0,0.9);
            transform: translate(-50%, -50%) scale(1.1);
        }
        .play-icon {
            width: 0;
            height: 0;
            border-left: 18px solid white;
            border-top: 12px solid transparent;
            border-bottom: 12px solid transparent;
            margin-left: 4px;
        }
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
        .video-badge {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Pinterest Pins - ${monthName} ${year}</h1>
        <p>Downloaded images and pin links from Pinterest messages. Click images to view full size.</p>
    </div>
    
    <div class="pin-grid" id="gallery">
        ${images.map((img, index) => {
          const isVideo = img.isVideo || (img.filename && img.filename.includes(' video '));
          const videoRedirectFile = isVideo && img.filename ? img.filename.replace(/\.[^.]+$/, '.html').replace(/^pinterest-messages\//, '') : null;
          
          // Calculate relative path to the downloaded image file
          const localImagePath = img.filename ? img.filename.replace(/^pinterest-messages\//, '') : null;
          const imageSrc = localImagePath || img.imageUrl; // Fallback to online URL if no filename
          
          return `
            <div class="pin-card">
                <a href="${imageSrc}" class="pin-image-container" ${isVideo ? 'onclick="return false;"' : ''} target="_blank">
                    <img src="${imageSrc}" alt="Pinterest Pin" class="pin-image" loading="lazy">
                    ${isVideo ? `
                        <div class="video-badge">VIDEO</div>
                        <div class="video-overlay" onclick="openVideoRedirect('${videoRedirectFile || '#'}')">
                            <div class="play-icon"></div>
                        </div>
                    ` : ''}
                </a>
                <div class="pin-info">
                    <div class="pin-sender">From: Sender ${img.senderId}</div>
                    <div class="pin-date">Message: ${img.messageId}</div>
                    ${img.timestamp ? `<div class="pin-date">Time: ${img.timestamp}</div>` : ''}
                    ${img.username ? `<div class="pin-date">User: ${img.username}</div>` : ''}
                    ${img.pinUrl ? `<a href="${img.pinUrl}" target="_blank" class="pin-link">View Original Pin</a>` : ''}
                </div>
            </div>
          `;
        }).join('')}
    </div>

    <!-- PhotoSwipe JS -->
    <script src="js/photoswipe.umd.min.js"></script>
    <script src="js/photoswipe-lightbox.umd.min.js"></script>
    
    <script>
        // Initialize PhotoSwipe Lightbox for images only (not videos)
        const lightbox = new PhotoSwipeLightbox({
            gallery: '#gallery',
            children: 'a.pin-image-container:not([onclick])', // Only anchor tags that are not videos
            pswpModule: PhotoSwipe,
            padding: { top: 20, bottom: 20, left: 20, right: 20 },
            bgOpacity: 0.9,
            loop: true,
            zoom: true,
            preload: [1, 1], // Preload 1 image before and after current
            // Let PhotoSwipe determine image dimensions dynamically
            showHideAnimationType: 'zoom',
            // Enable scrolling for large images
            wheelToZoom: true,
            // Configure zoom behavior
            initialZoomLevel: 'fit',
            secondaryZoomLevel: 1.0, // 100% zoom level
            maxZoomLevel: 2.0,
        });
        
        // Customize lightbox behavior
        lightbox.on('uiRegister', function() {
            lightbox.pswp.ui.registerElement({
                name: 'custom-caption',
                order: 9,
                isButton: false,
                appendTo: 'root',
                html: '',
                onInit: (el, pswp) => {
                    lightbox.pswp.on('change', () => {
                        const currSlideElement = lightbox.pswp.currSlide.data.element;
                        const caption = currSlideElement.closest('.pin-card').querySelector('.pin-info').innerHTML;
                        el.innerHTML = '<div style="position: absolute; bottom: 20px; left: 20px; right: 20px; background: rgba(0,0,0,0.7); color: white; padding: 15px; border-radius: 8px; font-size: 14px;">' + caption + '</div>';
                    });
                }
            });
        });
        
        // Add keyboard navigation improvements
        lightbox.on('beforeOpen', () => {
            document.addEventListener('keydown', handleKeydown);
        });
        
        lightbox.on('destroy', () => {
            document.removeEventListener('keydown', handleKeydown);
        });
        
        function handleKeydown(e) {
            if (e.key === 'Escape') {
                lightbox.pswp.close();
            }
        }
        
        // Add custom zoom behavior for better image viewing
        lightbox.on('beforeOpen', () => {
            lightbox.pswp.on('change', () => {
                const slide = lightbox.pswp.currSlide;
                if (slide && slide.data) {
                    // If image would be scaled down to fit, allow clicking to view at 100%
                    const fitZoom = slide.zoomLevels.fit;
                    if (fitZoom < 1.0) {
                        // Image is larger than viewport, clicking will zoom to 100%
                        slide.zoomLevels.secondary = 1.0;
                    } else {
                        // Image fits in viewport, clicking will zoom in further
                        slide.zoomLevels.secondary = Math.min(2.0, fitZoom * 2);
                    }
                }
            });
        });

        lightbox.init();
        
        // Function to handle video redirect
        function openVideoRedirect(filename) {
            if (filename && filename !== '#') {
                // Try to open the HTML redirect file in same directory
                window.open(filename, '_blank');
            }
        }
        
        // PhotoSwipe automatically handles clicks on anchor tags, no manual handlers needed
    </script>
</body>
</html>`;
  }
}

const downloader = new PinterestDownloader();

// Function to forward logs to content script
function logToContentScript(tabId, message) {
  try {
    chrome.tabs.sendMessage(tabId, {
      type: 'BACKGROUND_LOG',
      message: message
    }).catch(() => {}); // Ignore errors if content script not available
  } catch (error) {
    // Ignore - content script might not be available
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background: Received message:', message.type, message);
  const tabId = sender.tab?.id;
  
  if (message.type === 'DOWNLOAD_IMAGES') {
    handleDownloadImages(message.images, tabId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Background: Error in handleDownloadImages:', error);
      if (tabId) logToContentScript(tabId, `Background: Error in handleDownloadImages: ${error}`);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep the message channel open for async response
  } else if (message.type === 'GET_LAST_PROCESSED') {
    sendResponse({ lastProcessedMessageId: downloader.lastProcessedMessageId });
  } else if (message.type === 'CLEAR_STORAGE') {
    // Clear in-memory state
    downloader.downloadedImages.clear();
    downloader.lastProcessedMessageId = '';
    
    const clearMsg = 'Background: Cleared all download history and state';
    console.log(clearMsg);
    if (tabId) logToContentScript(tabId, clearMsg);
    
    sendResponse({ success: true });
  } else if (message.type === 'FETCH_PIN_IMAGE') {
    const pinNumber = message.pinNumber || 'unknown';
    const logMsg = `Background: Pin ${pinNumber} handling FETCH_PIN_IMAGE for: ${message.pinUrl}`;
    console.log(logMsg);
    if (tabId) logToContentScript(tabId, logMsg);
    
    handleFetchPinImage(message.pinUrl, pinNumber, tabId).then(result => {
      const responseMsg = `Background: Pin ${pinNumber} sending response: ${JSON.stringify(result)}`;
      console.log(responseMsg);
      if (tabId) logToContentScript(tabId, responseMsg);
      sendResponse(result);
    }).catch(error => {
      const errorMsg = `Background: Pin ${pinNumber} error fetching pin image: ${error}`;
      console.error(errorMsg);
      if (tabId) logToContentScript(tabId, errorMsg);
      sendResponse({ error: error.message });
    });
    return true; // Keep the message channel open for async response
  }
});

async function handleFetchPinImage(pinUrl, pinNumber = 'unknown', tabId = null) {
  try {
    const logMsg = `Background: Pin ${pinNumber} fetching pin page: ${pinUrl}`;
    console.log(logMsg);
    if (tabId) logToContentScript(tabId, logMsg);
    
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
      const errorMsg = `HTTP ${response.status} for URL: ${pinUrl}`;
      console.error(`Background: Pin ${pinNumber} failed to fetch pin page:`, errorMsg);
      return { error: errorMsg };
    }
    
    const html = await response.text();
    
    // First check if this is a video pin
    const videoResult = extractVideoFromHtml(html, pinNumber, tabId);
    if (videoResult.isVideo) {
      const videoDetectedMsg = `Background: Pin ${pinNumber} detected as video with poster: ${videoResult.imageUrl}`;
      console.log(videoDetectedMsg);
      if (tabId) logToContentScript(tabId, videoDetectedMsg);
      return videoResult;
    }
    
    // If not a video, extract image URL
    const imageUrl = extractImageFromHtml(html);
    
    if (imageUrl) {
      // Check if the image URL indicates it's actually a video thumbnail
      if (imageUrl.includes('/videos/thumbnails/')) {
        const videoThumbMsg = `Background: Pin ${pinNumber} detected video thumbnail, looking for video element: ${imageUrl}`;
        console.log(videoThumbMsg);
        if (tabId) logToContentScript(tabId, videoThumbMsg);
        
        // This is a video thumbnail, look for the actual video element
        const videoResult = extractVideoElementFromHtml(html, pinNumber, tabId);
        if (videoResult.isVideo) {
          const foundVideoMsg = `Background: Pin ${pinNumber} found video element with poster: ${videoResult.imageUrl}`;
          console.log(foundVideoMsg);
          if (tabId) logToContentScript(tabId, foundVideoMsg);
          return videoResult;
        } else {
          // Fallback: use the thumbnail as poster for video
          const fallbackMsg = `Background: Pin ${pinNumber} no video element found, using thumbnail as video poster`;
          console.log(fallbackMsg);
          if (tabId) logToContentScript(tabId, fallbackMsg);
          return {
            isVideo: true,
            imageUrl: getHighResImageUrl(imageUrl)
          };
        }
      } else {
        const imageMsg = `Background: Pin ${pinNumber} found main image: ${imageUrl}`;
        console.log(imageMsg);
        if (tabId) logToContentScript(tabId, imageMsg);
        return { 
          imageUrl: getHighResImageUrl(imageUrl),
          isVideo: false
        };
      }
    } else {
      const errorMsg = `No image found in HTML for URL: ${pinUrl}`;
      console.error(`Background: Pin ${pinNumber}`, errorMsg);
      if (tabId) logToContentScript(tabId, `Background: Pin ${pinNumber} ${errorMsg}`);
      return { error: errorMsg };
    }
    
  } catch (error) {
    const errorMsg = `${error.message} for URL: ${pinUrl}`;
    console.error(`Background: Pin ${pinNumber} error fetching pin image:`, errorMsg);
    if (tabId) logToContentScript(tabId, `Background: Pin ${pinNumber} error fetching pin image: ${errorMsg}`);
    return { error: errorMsg };
  }
}

function extractVideoFromHtml(html, pinNumber, tabId = null) {
  // Look for video elements with poster attributes in the HTML
  const videoPatterns = [
    // Look for video tags with poster attributes
    /<video[^>]*poster="([^"]*)"[^>]*>/i,
    /<video[^>]*poster='([^']*)'[^>]*>/i,
    
    // Look for video elements in specific Pinterest video containers
    /<div[^>]*data-test-id="video[^"]*"[^>]*>[\s\S]*?<video[^>]*poster="([^"]*)"[^>]*>/i,
    
    // Look for Pinterest video metadata
    /"video_url":\s*"([^"]*)"[\s\S]*?"poster_url":\s*"([^"]*)"/, // This would capture both video and poster
  ];
  
  for (const pattern of videoPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const foundMsg = `Background: Pin ${pinNumber} found video with pattern: ${pattern.toString().substring(0, 50)}...`;
      console.log(foundMsg);
      if (tabId) logToContentScript(tabId, foundMsg);
      return {
        isVideo: true,
        imageUrl: getHighResImageUrl(match[1]) // Use poster as image URL
      };
    }
  }
  
  // Also check for video indicators in metadata/JSON
  const videoIndicators = [
    /"type":\s*"video"/i,
    /"is_video":\s*true/i,
    /"story_pin_video"/i,
    /"videoUrl"/i
  ];
  
  for (const indicator of videoIndicators) {
    if (html.match(indicator)) {
      const indicatorMsg = `Background: Pin ${pinNumber} detected video indicator: ${indicator.toString()}`;
      console.log(indicatorMsg);
      if (tabId) logToContentScript(tabId, indicatorMsg);
      // If we detect video but can't find poster, try to extract any poster image
      const posterMatch = html.match(/"poster[^"]*":\s*"([^"]*)"/i);
      if (posterMatch) {
        const posterMsg = `Background: Pin ${pinNumber} found video poster from metadata: ${posterMatch[1]}`;
        console.log(posterMsg);
        if (tabId) logToContentScript(tabId, posterMsg);
        return {
          isVideo: true,
          imageUrl: getHighResImageUrl(posterMatch[1])
        };
      }
      // If no poster found, we'll fall back to regular image extraction
      const fallbackMsg = `Background: Pin ${pinNumber} video detected but no poster found, falling back to image extraction`;
      console.log(fallbackMsg);
      if (tabId) logToContentScript(tabId, fallbackMsg);
      break;
    }
  }
  
  return { isVideo: false };
}

function extractVideoElementFromHtml(html, pinNumber, tabId = null) {
  // More specific video element patterns to look for when we know it's a video
  const videoElementPatterns = [
    // Look for video tags with poster attributes
    /<video[^>]*poster="([^"]*)"[^>]*>/i,
    /<video[^>]*poster='([^']*)'[^>]*>/i,
    
    // Look for video source URLs and try to find associated posters
    /<video[^>]*>[\s\S]*?<source[^>]*src="([^"]*)"[^>]*>[\s\S]*?<\/video>/i,
    
    // Look for video elements with data attributes
    /<video[^>]*data-[^>]*poster[^>]*="([^"]*)"[^>]*>/i,
    
    // Look for Pinterest video containers with poster images
    /<div[^>]*class="[^"]*video[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*>/i,
  ];
  
  for (const pattern of videoElementPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const patternMsg = `Background: Pin ${pinNumber} found video element with pattern: ${pattern.toString().substring(0, 50)}...`;
      console.log(patternMsg);
      if (tabId) logToContentScript(tabId, patternMsg);
      
      // Make sure the found URL is actually an image (poster) not a video file
      const foundUrl = match[1];
      if (foundUrl.includes('.mp4') || foundUrl.includes('.webm') || foundUrl.includes('.mov')) {
        // This is a video file, not a poster - keep looking
        continue;
      }
      
      return {
        isVideo: true,
        imageUrl: getHighResImageUrl(foundUrl)
      };
    }
  }
  
  // Look for video poster in JSON data
  const jsonPosterPatterns = [
    /"poster":\s*"([^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
    /"poster_url":\s*"([^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
    /"video_poster":\s*"([^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i,
  ];
  
  for (const pattern of jsonPosterPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const jsonMsg = `Background: Pin ${pinNumber} found video poster in JSON: ${match[1]}`;
      console.log(jsonMsg);
      if (tabId) logToContentScript(tabId, jsonMsg);
      return {
        isVideo: true,
        imageUrl: getHighResImageUrl(match[1])
      };
    }
  }
  
  const noVideoMsg = `Background: Pin ${pinNumber} no video element found in HTML`;
  console.log(noVideoMsg);
  if (tabId) logToContentScript(tabId, noVideoMsg);
  return { isVideo: false };
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

let currentDelay = 100; // Start with 100ms delay
const maxDelay = 5000; // Max 5 second delay
const delayMultiplier = 2; // Double delay on 429

async function handleDownloadImages(images, tabId = null) {
  const totalFound = images.length;
  let alreadyDownloaded = 0;
  let actuallyDownloaded = 0;
  let errors = 0;
  
  const startMsg = `Background: Processing ${totalFound} pins`;
  console.log(startMsg);
  if (tabId) logToContentScript(tabId, startMsg);
  const imagesByMonth = {};
  
  // Add pin numbers to images
  images.forEach((img, index) => {
    img.pinNumber = index + 1;
  });
  
  for (const img of images) {
    const processingMsg = `Background: Processing pin ${img.pinNumber}/${totalFound}`;
    console.log(processingMsg);
    if (tabId) logToContentScript(tabId, processingMsg);
    
    // Skip if already downloaded
    const imageId = `${img.senderId}_${img.messageId}_${img.imageUrl}`;
    if (downloader.downloadedImages.has(imageId)) {
      const alreadyMsg = `Background: Pin ${img.pinNumber} already downloaded`;
      console.log(alreadyMsg);
      if (tabId) logToContentScript(tabId, alreadyMsg);
      alreadyDownloaded++;
      continue;
    }

    try {
      // Download image (or poster for video)
      const filename = downloader.generateFilename(img.imageUrl, img.senderId, img.messageId, img.pinId, img.timestamp, img.isVideo, img.username);
      const downloadMsg = `Background: Pin ${img.pinNumber} downloading ${img.isVideo ? 'video poster' : 'image'}: ${filename}`;
      console.log(downloadMsg);
      if (tabId) logToContentScript(tabId, downloadMsg);
      
      await downloader.downloadImage(img.imageUrl, filename);
      actuallyDownloaded++;

      // For videos, also create an HTML redirect file
      if (img.isVideo && img.pinUrl) {
        const htmlMsg = `Background: Pin ${img.pinNumber} creating HTML redirect for video`;
        console.log(htmlMsg);
        if (tabId) logToContentScript(tabId, htmlMsg);
        await downloader.createVideoRedirectHtml(img.pinUrl, filename);
      }

      // Group by month for HTML generation
      const date = new Date();
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      if (!imagesByMonth[monthKey]) {
        imagesByMonth[monthKey] = [];
      }
      
      // Add filename to image object for HTML generation
      const imgWithFilename = { ...img, filename: filename };
      imagesByMonth[monthKey].push(imgWithFilename);

      // Save progress
      await downloader.saveProgress(imageId, img.messageId);
      
      // Reduce delay on success (speed up)
      currentDelay = Math.max(100, currentDelay * 0.8);
      
    } catch (error) {
      const errorMsg = `Background: Pin ${img.pinNumber} download failed: ${error}`;
      console.error(errorMsg);
      if (tabId) logToContentScript(tabId, errorMsg);
      errors++;
      
      // If 429 error, increase delay (throttle)
      if (error.message && error.message.includes('429')) {
        currentDelay = Math.min(maxDelay, currentDelay * delayMultiplier);
        const delayMsg = `Background: Pin ${img.pinNumber} got 429, increasing delay to ${currentDelay}ms`;
        console.log(delayMsg);
        if (tabId) logToContentScript(tabId, delayMsg);
      }
    }
    
    // Apply current delay between downloads
    if (currentDelay > 100) {
      await new Promise(resolve => setTimeout(resolve, currentDelay));
    }
  }

  // Log the summary
  const summaryMsg = `Pinterest Downloader: Found ${totalFound} pins, downloaded ${actuallyDownloaded}, skipped ${alreadyDownloaded} already downloaded, ${errors} errors`;
  console.log(summaryMsg);
  if (tabId) logToContentScript(tabId, summaryMsg);

  // Generate monthly HTML files
  for (const [monthKey, monthImages] of Object.entries(imagesByMonth)) {
    const [year, month] = monthKey.split('-').map(Number);
    await downloader.saveMonthlyHtml(monthImages, year, month);
  }
}