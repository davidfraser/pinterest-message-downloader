# Pinterest Message Image Downloader

A Chrome extension that automatically downloads images and links to videos from Pinterest messages, organizing them by sender with timestamps and usernames.

## Features

- **Automatic Image Download**: Downloads all images sent in Pinterest messages
- **Video Support**: Detects Pinterest video pins and downloads poster images with HTML redirects to original videos
- **Smart Organization**: 
  - Organizes all downloads in `pinterest-messages/` directory
  - Creates subfolders per sender: `from-{senderId}`
  - Timestamps files with ISO format: `YYYY-MM-DD HHMM`
  - Includes sender usernames in filenames
  - Adds message and pin IDs for unique identification
- **Incremental Processing**: Remembers last processed message to avoid re-downloading
- **Interactive HTML Gallery**: 
  - Generates monthly HTML files with thumbnail grid
  - Includes ALL previously downloaded images, not just current session
  - Uses local file references for completely offline viewing
  - Click images for full-screen lightbox viewing with correct aspect ratios
  - Keyboard navigation (left/right arrows, ESC to close)
  - Video thumbnails with play button overlay
  - Only regenerates HTML for months with new downloads
  - Automatically downloads PhotoSwipe library for offline viewing
- **Throttling & Retry**: Handles rate limiting with intelligent backoff
- **Progress Tracking**: Shows download counts and processing status

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The Pinterest Image Downloader icon should appear in your extensions bar

## Usage

1. **Navigate to Pinterest**: Go to any Pinterest message conversation
2. **Open the Extension**: Click the Pinterest Image Downloader icon in your browser toolbar
3. **Start Scanning**: Click "Scan for New Images" to begin downloading
4. **Monitor Progress**: Watch the console for detailed progress logs
5. **Check Downloads**: Images will be saved to your default Downloads folder

## File Organization

```
Downloads/
└── pinterest-messages/
    ├── pinterest_pins_2025_07.html
    ├── pinterest_pins_2025_08.html
    ├── js/
    │   ├── photoswipe.css
    │   ├── photoswipe.umd.min.js
    │   └── photoswipe-lightbox.umd.min.js
    ├── from-{senderId1}/
    │   ├── 2025-07-30 22:08 John Doe 12345_pin_67890.jpg
    │   ├── 2025-07-30 22:10 John Doe video 12346_pin_67891.jpg
    │   ├── 2025-07-30 22:10 John Doe video 12346_pin_67891.html
    │   └── ...
    └── from-{senderId2}/
        ├── 2025-07-31 14:30 Jane Smith 12347_pin_67892.jpg
        └── ...
```

### Filename Format
`{timestamp} {username} [video] {messageId}_pin_{pinId}.{ext}`

- **Timestamp**: `YYYY-MM-DD HHMM` format
- **Username**: Sender's display name (sanitized for filesystem)
- **Video**: Added for video pins
- **Message ID**: Unique Pinterest message identifier
- **Pin ID**: Unique Pinterest pin identifier

## Features Explained

### Video Handling
- Detects Pinterest video pins automatically
- Downloads the poster/thumbnail image
- Creates an HTML redirect file that opens the original video pin
- Marks video files with "video" prefix in filename

### Progress Tracking
- Tracks which messages have been processed
- Skips already downloaded images
- Shows counts: found/downloaded/skipped/errors
- Maintains state between extension sessions

### Rate Limiting
- Starts with 100ms delay between requests
- Automatically increases delay if rate limited (HTTP 429)
- Reduces delay on successful requests for optimal speed
- Maximum 5-second delay to respect Pinterest's servers

### Monthly Reports
- Generates HTML files organized by month
- Shows thumbnail grid of all downloaded images
- Links back to original Pinterest pins
- Beautiful responsive design

## Permissions Required

- `storage`: Save download progress and settings
- `downloads`: Download images and HTML files
- `activeTab`: Access current Pinterest tab
- `scripting`: Inject scripts to scan Pinterest messages
- `https://*.pinterest.com/*`: Access Pinterest pages
- `https://*.pinimg.com/*`: Download Pinterest images

## Development

### File Structure
```
├── manifest.json          # Extension configuration
├── popup.html/.js         # Extension popup interface
├── content.js             # Content script (isolated context)
├── injected.js            # Page script (Pinterest's context)
├── background.js          # Service worker for downloads
├── README.md              # This file
└── LICENSE.md             # MIT license
```

### Architecture
1. **Popup**: User interface and scan triggering
2. **Content Script**: Coordinates between popup and page
3. **Injected Script**: Accesses Pinterest's DOM in page context
4. **Background**: Handles pin fetching and file downloads

### Building
No build process required. The extension runs directly from source files.

### Debugging
- Open browser console to see detailed logging
- Check service worker console for background script logs
- Use Chrome DevTools Network tab to monitor Pinterest API calls

## Troubleshooting

### Extension Not Working
- Ensure you're on a Pinterest message page
- Try refreshing the page and reloading the extension
- Check browser console for error messages

### No Images Found
- Make sure you're in a Pinterest message conversation
- Verify messages contain Pinterest pin links
- Check that pins are not private or deleted

### Downloads Failing
- Check your Downloads folder permissions
- Ensure sufficient disk space
- Try clearing extension storage and rescanning

### Rate Limiting
- Extension automatically handles rate limiting
- If you see many 429 errors, wait a few minutes before rescanning
- The extension will slow down automatically

## Privacy & Security

- Only accesses Pinterest domains as specified in permissions
- Does not collect or transmit any personal data
- All processing happens locally in your browser
- Downloaded files stay on your local machine

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on Pinterest
5. Submit a pull request

## Support

For issues or feature requests, please create an issue in the repository.

## License

MIT License - see LICENSE.md for details