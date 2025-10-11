document.getElementById('entryForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const title = document.getElementById('entryTitle').value;
    const tags = document.getElementById('entryTags').value
        .split(' ')
        .filter(tag => tag.startsWith('#'))
        .map(tag => tag.trim());
    const content = document.getElementById('entryContent').value;
    const videoLink = document.getElementById('entryVideoLink')?.value.trim() || '';

    const mediaFiles = {
        image: document.getElementById('entryImage').files[0],
        audio: document.getElementById('entryAudio').files[0]
    };

    try {
        await handleMediaUpload(title, tags, content, mediaFiles, videoLink);
    } catch (error) {
        journalApp.showNotification('Error saving entry: ' + error.message, true);
    }
});

async function handleMediaUpload(title, tags, content, mediaFiles, videoLink) {
    let mediaData = null;

    if (mediaFiles.image || mediaFiles.audio) {
        const file = mediaFiles.image || mediaFiles.audio;
        const type = mediaFiles.image ? 'image' : 'audio';

        if (file.size > journalApp.MAX_FILE_SIZE) {
            if (type === 'image') {
                mediaData = {
                    type: 'image',
                    data: await journalApp.compressImage(file)
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

// Set up media preview handlers
const imageInput = document.getElementById('entryImage');
const imagePreview = document.getElementById('imagePreview');

imageInput.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) {
        imagePreview.style.display = 'none';
        return;
    }

    if (file.size > journalApp.MAX_FILE_SIZE) {
        try {
            imagePreview.src = await journalApp.compressImage(file);
            imagePreview.style.display = 'block';
        } catch (error) {
            journalApp.showNotification('Error compressing image', true);
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

const audioInput = document.getElementById('entryAudio');
const audioPreview = document.getElementById('audioPreview');

audioInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) {
        audioPreview.style.display = 'none';
        return;
    }

    if (file.size > journalApp.MAX_FILE_SIZE) {
        journalApp.showNotification('Audio file too large (max 5MB)', true);
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

// Video link preview
const videoLinkInput = document.getElementById('entryVideoLink');
const videoPreview = document.getElementById('videoPreview');

if (videoLinkInput) {
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
                journalApp.showNotification('Google Drive link added (preview not available)');
            } else {
                videoPreview.style.display = 'none';
            }
        } else {
            videoPreview.style.display = 'none';
        }
    });
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
        await journalApp.saveEntryToFirestore(entryData);
        journalApp.showNotification('Entry saved successfully!');
        resetForm();
        setTimeout(() => {
            window.location.href = 'entries.html';
        }, 1500);
    } catch (error) {
        console.error('Error saving entry:', error);
        journalApp.showNotification('Error saving entry to cloud', true);
    }
}

function resetForm() {
    document.getElementById('entryForm').reset();
    imagePreview.style.display = 'none';
    audioPreview.style.display = 'none';
    if (videoPreview) videoPreview.style.display = 'none';
}