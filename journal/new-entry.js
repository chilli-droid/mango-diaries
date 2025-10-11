// Wait for journalApp to be initialized
document.addEventListener('DOMContentLoaded', function() {
    // Check if journalApp is available
    if (!window.journalApp) {
        console.error('journalApp not available');
        setTimeout(() => {
            if (window.journalApp) {
                setupFormHandlers();
            }
        }, 1000);
    } else {
        setupFormHandlers();
    }
});

function setupFormHandlers() {
    const entryForm = document.getElementById('entryForm');
    if (!entryForm) {
        console.error('Entry form not found');
        return;
    }

    entryForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Check authentication
        if (!window.journalApp || !window.journalApp.checkAuth) {
            window.journalApp?.showNotification('Please sign in to save entries', true);
            return;
        }

        const authCheck = await window.journalApp.checkAuth();
        if (!authCheck) return;

        const title = document.getElementById('entryTitle').value.trim();
        const tagsInput = document.getElementById('entryTags').value;
        const tags = tagsInput
            .split(' ')
            .filter(tag => tag.startsWith('#'))
            .map(tag => tag.trim());
        const content = document.getElementById('entryContent').value.trim();
        const videoLink = document.getElementById('entryVideoLink')?.value.trim() || '';

        // Validate inputs
        if (!title) {
            window.journalApp.showNotification('Please enter a title', true);
            return;
        }
        if (!content) {
            window.journalApp.showNotification('Please enter some content', true);
            return;
        }

        const mediaFiles = {
            image: document.getElementById('entryImage')?.files[0],
            audio: document.getElementById('entryAudio')?.files[0]
        };

        try {
            await handleMediaUpload(title, tags, content, mediaFiles, videoLink);
        } catch (error) {
            console.error('Error saving entry:', error);
            window.journalApp?.showNotification('Error saving entry: ' + error.message, true);
        }
    });

    // Set up media preview handlers
    setupMediaPreviews();
}

async function handleMediaUpload(title, tags, content, mediaFiles, videoLink) {
    let mediaData = null;

    if (mediaFiles.image || mediaFiles.audio) {
        const file = mediaFiles.image || mediaFiles.audio;
        const type = mediaFiles.image ? 'image' : 'audio';

        if (file.size > window.journalApp.MAX_FILE_SIZE) {
            if (type === 'image') {
                window.journalApp.showNotification('Compressing image...');
                mediaData = {
                    type: 'image',
                    data: await window.journalApp.compressImage(file)
                };
            } else {
                throw new Error('Audio file too large (max 5MB)');
            }
        } else {
            const reader = new FileReader();
            mediaData = await new Promise((resolve, reject) => {
                reader.onload = e => resolve({
                    type: type,
                    data: e.target.result
                });
                reader.onerror = () => reject(new Error('Failed to read file'));
                reader.readAsDataURL(file);
            });
        }
    }

    await saveEntry(title, tags, content, mediaData, videoLink);
}

function setupMediaPreviews() {
    const imageInput = document.getElementById('entryImage');
    const imagePreview = document.getElementById('imagePreview');

    if (imageInput && imagePreview) {
        imageInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) {
                imagePreview.style.display = 'none';
                return;
            }

            if (file.size > window.journalApp.MAX_FILE_SIZE) {
                try {
                    window.journalApp.showNotification('Compressing image...');
                    imagePreview.src = await window.journalApp.compressImage(file);
                    imagePreview.style.display = 'block';
                } catch (error) {
                    window.journalApp.showNotification('Error compressing image', true);
                    this.value = '';
                }
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.src = e.target.result;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        });
    }

    const audioInput = document.getElementById('entryAudio');
    const audioPreview = document.getElementById('audioPreview');

    if (audioInput && audioPreview) {
        audioInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) {
                audioPreview.style.display = 'none';
                return;
            }

            if (file.size > window.journalApp.MAX_FILE_SIZE) {
                window.journalApp.showNotification('Audio file too large (max 5MB)', true);
                this.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                audioPreview.src = e.target.result;
                audioPreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        });
    }

    // Video link preview
    const videoLinkInput = document.getElementById('entryVideoLink');
    const videoPreview = document.getElementById('videoPreview');

    if (videoLinkInput && videoPreview) {
        videoLinkInput.addEventListener('input', function() {
            const link = this.value.trim();
            if (link) {
                // Extract video ID from YouTube links
                let videoId = '';
                if (link.includes('youtube.com/watch?v=')) {
                    videoId = link.split('v=')[1]?.split('&')[0];
                } else if (link.includes('youtu.be/')) {
                    videoId = link.split('youtu.be/')[1]?.split('?')[0];
                }

                if (videoId) {
                    videoPreview.src = `https://www.youtube.com/embed/${videoId}`;
                    videoPreview.style.display = 'block';
                } else if (link.includes('drive.google.com')) {
                    videoPreview.style.display = 'none';
                    window.journalApp.showNotification('Google Drive link added (preview not available)');
                } else {
                    videoPreview.style.display = 'none';
                }
            } else {
                videoPreview.style.display = 'none';
            }
        });
    }
}

async function saveEntry(title, tags, content, mediaData, videoLink) {
    const entryData = {
        id: Date.now(),
        title,
        tags,
        content,
        mediaData,
        videoLink: videoLink || null,
        deleted: false
    };

    try {
        window.journalApp.showNotification('Saving entry...');
        await window.journalApp.saveEntryToFirestore(entryData);
        window.journalApp.showNotification('Entry saved successfully!');
        resetForm();
        setTimeout(() => {
            window.location.href = 'entries.html';
        }, 1500);
    } catch (error) {
        console.error('Error saving entry:', error);
        window.journalApp.showNotification('Error saving entry to cloud: ' + error.message, true);
        throw error;
    }
}

function resetForm() {
    const form = document.getElementById('entryForm');
    if (form) form.reset();
    
    const imagePreview = document.getElementById('imagePreview');
    const audioPreview = document.getElementById('audioPreview');
    const videoPreview = document.getElementById('videoPreview');
    
    if (imagePreview) imagePreview.style.display = 'none';
    if (audioPreview) audioPreview.style.display = 'none';
    if (videoPreview) videoPreview.style.display = 'none';
}