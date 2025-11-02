// Wait for journalApp to be initialized
function waitForJournalApp() {
    return new Promise((resolve) => {
        if (window.journalApp) {
            resolve();
        } else {
            const checkInterval = setInterval(() => {
                if (window.journalApp) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            // Timeout after 10 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                console.error('journalApp failed to load');
                window.journalApp.showNotification('App initialization failed. Please refresh the page.', true);
            }, 10000);
        }
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    console.log('new-entry.js: DOM loaded');
    
    // Wait for journalApp to be available
    await waitForJournalApp();
    console.log('new-entry.js: journalApp is ready');
    
    // Set up form submission
    const entryForm = document.getElementById('entryForm');
    if (entryForm) {
        entryForm.addEventListener('submit', handleFormSubmit);
        console.log('new-entry.js: Form listener attached');
    } else {
        console.error('new-entry.js: Entry form not found!');
    }
    
    // Set up media previews
    setupMediaPreviews();
    
    // Set up file size warnings
    setupFileSizeWarnings();
});

// Handle form submission
async function handleFormSubmit(e) {
    e.preventDefault();
    console.log('Form submitted!');
    
    const title = document.getElementById('entryTitle').value.trim();
    const content = document.getElementById('entryContent').value.trim();
    const tagsInput = document.getElementById('entryTags').value;
    const videoLink = document.getElementById('entryVideoLink').value.trim() || null;
    
    console.log('Form data:', { title, content, tagsInput, videoLink });
    
    // Validate inputs
    if (!title) {
        window.journalApp.showNotification('Please enter a title', true);
        return;
    }
    
    if (!content) {
        window.journalApp.showNotification('Please enter some content', true);
        return;
    }
    
    // Parse tags
    const tags = tagsInput
        .split(' ')
        .filter(tag => tag.startsWith('#'))
        .map(tag => tag.trim());
    
    console.log('Parsed tags:', tags);
    
    // Disable submit button to prevent double submission
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';
    
    // Handle media files
    let mediaData = null;
    const imageFile = document.getElementById('entryImage').files[0];
    const audioFile = document.getElementById('entryAudio').files[0];
    
    try {
        if (imageFile) {
            console.log('Processing image file:', imageFile.name, 'Size:', Math.round(imageFile.size / 1024), 'KB');
            
            // Check file size before compression
            if (imageFile.size > window.journalApp.MAX_FILE_SIZE) {
                window.journalApp.showNotification(`Image file is too large (${Math.round(imageFile.size / 1024 / 1024)}MB). Maximum size is 5MB.`, true);
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                return;
            }
            
            // Show compression message
            window.journalApp.showNotification('Compressing image...');
            
            // Compress and store image with 800KB target
            try {
                const compressedImage = await window.journalApp.compressImage(imageFile, 800);
                const compressedSize = Math.round(compressedImage.length / 1024);
                console.log('Image compressed to', compressedSize, 'KB');
                
                mediaData = {
                    type: 'image',
                    data: compressedImage
                };
                
                window.journalApp.showNotification(`Image compressed to ${compressedSize}KB`);
            } catch (compressionError) {
                console.error('Compression error:', compressionError);
                window.journalApp.showNotification(compressionError.message || 'Failed to compress image', true);
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                return;
            }
            
        } else if (audioFile) {
            console.log('Processing audio file:', audioFile.name, 'Size:', Math.round(audioFile.size / 1024), 'KB');
            
            // Check file size
            if (audioFile.size > window.journalApp.MAX_FILE_SIZE) {
                window.journalApp.showNotification(`Audio file is too large (${Math.round(audioFile.size / 1024 / 1024)}MB). Maximum size is 5MB.`, true);
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                return;
            }
            
            // Check if audio is too large for Firestore (1MB)
            if (audioFile.size > 1024 * 1024) {
                window.journalApp.showNotification('Audio files larger than 1MB cannot be saved to Firestore. Please use a shorter recording or compress the audio.', true);
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                return;
            }
            
            // Read audio file
            const audioData = await readFileAsDataURL(audioFile);
            mediaData = {
                type: 'audio',
                data: audioData
            };
            console.log('Audio file processed, size:', Math.round(audioData.length / 1024), 'KB');
        }
        
        // Create entry data object
        const entryData = {
            title: title,
            content: content,
            tags: tags,
            videoLink: videoLink,
            mediaData: mediaData,
            deleted: false
        };
        
        console.log('Entry data prepared:', {
            title: entryData.title,
            content: entryData.content.substring(0, 50) + '...',
            tags: entryData.tags,
            videoLink: entryData.videoLink,
            hasMedia: !!entryData.mediaData,
            mediaType: entryData.mediaData?.type,
            mediaSize: entryData.mediaData ? Math.round(entryData.mediaData.data.length / 1024) + 'KB' : 'N/A'
        });
        
        console.log('Calling saveEntryToFirestore...');
        // Save to Firestore
        const entryId = await window.journalApp.saveEntryToFirestore(entryData);
        console.log('Entry saved with ID:', entryId);
        
        // Show success message
        window.journalApp.showNotification('Entry saved successfully! Redirecting...');
        
        // Redirect to entries page after a short delay
        setTimeout(() => {
            window.location.href = 'entries.html';
        }, 1500);
        
    } catch (error) {
        console.error('Error in handleFormSubmit:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        let errorMessage = error.message || 'Unknown error occurred';
        
        // Provide more helpful error messages
        if (errorMessage.includes('too large') || errorMessage.includes('size')) {
            errorMessage = 'The image is too large. Please try a smaller image or take a new photo.';
        } else if (errorMessage.includes('permission')) {
            errorMessage = 'Permission denied. Please check your Firestore security rules.';
        } else if (errorMessage.includes('network')) {
            errorMessage = 'Network error. Please check your internet connection.';
        }
        
        window.journalApp.showNotification('Error saving entry: ' + errorMessage, true);
        
        // Re-enable submit button
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}

// Helper function to read file as data URL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

// Set up file size warnings
function setupFileSizeWarnings() {
    const imageInput = document.getElementById('entryImage');
    const audioInput = document.getElementById('entryAudio');
    
    if (imageInput) {
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const sizeMB = file.size / 1024 / 1024;
                console.log('Image selected:', file.name, 'Size:', sizeMB.toFixed(2), 'MB');
                
                if (sizeMB > 5) {
                    window.journalApp.showNotification('Warning: Image is larger than 5MB and may fail to upload', true);
                } else if (sizeMB > 2) {
                    window.journalApp.showNotification('Image is large and will be compressed', false);
                }
            }
        });
    }
    
    if (audioInput) {
        audioInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const sizeMB = file.size / 1024 / 1024;
                console.log('Audio selected:', file.name, 'Size:', sizeMB.toFixed(2), 'MB');
                
                if (sizeMB > 1) {
                    window.journalApp.showNotification('Warning: Audio files larger than 1MB cannot be saved to Firestore', true);
                } else if (sizeMB > 0.5) {
                    window.journalApp.showNotification('Audio file is moderately large', false);
                }
            }
        });
    }
}

// Set up media preview functionality
function setupMediaPreviews() {
    const imageInput = document.getElementById('entryImage');
    const audioInput = document.getElementById('entryAudio');
    const videoInput = document.getElementById('entryVideoLink');
    const imagePreview = document.getElementById('imagePreview');
    const audioPreview = document.getElementById('audioPreview');
    const videoPreview = document.getElementById('videoPreview');
    
    // Image preview
    if (imageInput) {
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    imagePreview.src = event.target.result;
                    imagePreview.style.display = 'block';
                    // Hide other previews
                    if (audioPreview) audioPreview.style.display = 'none';
                    if (videoPreview) videoPreview.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Audio preview
    if (audioInput) {
        audioInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    audioPreview.src = event.target.result;
                    audioPreview.style.display = 'block';
                    // Hide other previews
                    if (imagePreview) imagePreview.style.display = 'none';
                    if (videoPreview) videoPreview.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Video preview
    if (videoInput) {
        videoInput.addEventListener('input', function(e) {
            const videoLink = e.target.value.trim();
            if (videoLink) {
                const embedUrl = getVideoEmbedUrl(videoLink);
                if (embedUrl) {
                    videoPreview.src = embedUrl;
                    videoPreview.style.display = 'block';
                    // Hide other previews
                    if (imagePreview) imagePreview.style.display = 'none';
                    if (audioPreview) audioPreview.style.display = 'none';
                } else {
                    videoPreview.style.display = 'none';
                }
            } else {
                videoPreview.style.display = 'none';
            }
        });
    }
}

// Get video embed URL
function getVideoEmbedUrl(url) {
    try {
        // YouTube
        if (url.includes('youtube.com/watch?v=')) {
            const videoId = new URL(url).searchParams.get('v');
            if (videoId) {
                return `https://www.youtube.com/embed/${videoId}`;
            }
        } else if (url.includes('youtu.be/')) {
            const videoId = url.split('youtu.be/')[1]?.split('?')[0];
            if (videoId) {
                return `https://www.youtube.com/embed/${videoId}`;
            }
        }
        // Google Drive
        else if (url.includes('drive.google.com')) {
            if (url.includes('/file/d/')) {
                const fileId = url.split('/file/d/')[1]?.split('/')[0];
                if (fileId) {
                    return `https://drive.google.com/file/d/${fileId}/preview`;
                }
            }
        }
    } catch (error) {
        console.error('Error parsing video URL:', error);
    }
    return null;
}
