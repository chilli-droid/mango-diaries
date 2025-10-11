window.onload = function() {
    console.log('Trash page loaded');
    setupTrashListeners();
};

function setupTrashListeners() {
    document.querySelector('.close')?.addEventListener('click', () => {
        document.getElementById('entryModal').style.display = 'none';
    });
}

// This function will be called by the real-time listener in main.js
window.renderTrash = function() {
    console.log('renderTrash called');
    const trashList = document.getElementById('trashList');
    if (!trashList) {
        console.error('trashList element not found');
        return;
    }
    
    const entries = window.journalApp?.entries || [];
    console.log('Total entries:', entries.length);
    const trashedEntries = entries.filter(e => e.deleted);
    console.log('Trashed entries:', trashedEntries.length);

    if (trashedEntries.length === 0) {
        trashList.innerHTML = '<p>No items in trash</p>';
        return;
    }

    trashedEntries.sort((a, b) => {
        const dateA = new Date(a.deletedDate || a.date);
        const dateB = new Date(b.deletedDate || b.date);
        return dateB - dateA;
    });

    trashList.innerHTML = trashedEntries.map(entry => {
        const deletionDate = new Date(entry.deletedDate || entry.date);
        const daysLeft = 30 - Math.floor((new Date() - deletionDate) / (1000 * 60 * 60 * 24));

        return `
            <div class="entry trash">
                <h3>${entry.title}</h3>
                <small>Deleted: ${deletionDate.toLocaleString()}</small>
                <p class="days-left">Will be permanently deleted in ${Math.max(0, daysLeft)} days</p>
                <p class="tags">${entry.tags.join(' ')}</p>
                <p>${entry.content}</p>
                ${entry.mediaData ? createMediaElement(entry.mediaData) : ''}
                <div class="entry-controls">
                    <button onclick="window.restoreEntry('${entry.firestoreId}')">Restore</button>
                    <button onclick="window.editEntry('${entry.firestoreId}')">Edit</button>
                    <button onclick="window.deleteForever('${entry.firestoreId}')" class="delete-button">Delete Forever</button>
                </div>
            </div>
        `;
    }).join('');
    
    console.log('Trash rendered successfully');
};

function createMediaElement(mediaData) {
    if (!mediaData || !mediaData.data) return '';
    
    switch (mediaData.type) {
        case 'image':
            return `<img src="${mediaData.data}" class="rounded" alt="Entry image">`;
        case 'video':
            return `<video controls class="rounded" src="${mediaData.data}"></video>`;
        case 'audio':
            return `<audio controls src="${mediaData.data}"></audio>`;
        default:
            return '';
    }
}

window.restoreEntry = async function(firestoreId) {
    console.log('restoreEntry called with ID:', firestoreId);
    
    if (!firestoreId) {
        console.error('No firestoreId provided');
        return;
    }

    try {
        await window.journalApp.restoreEntryFromTrash(firestoreId);
        // renderTrash() will be called automatically by the real-time listener
    } catch (error) {
        console.error('Error restoring entry:', error);
        window.journalApp.showNotification('Error restoring entry', true);
    }
};

window.deleteForever = async function(firestoreId) {
    console.log('=== DELETE FOREVER CALLED ===');
    console.log('firestoreId:', firestoreId);
    console.log('journalApp exists:', !!window.journalApp);
    console.log('deleteEntryPermanently exists:', typeof window.journalApp?.deleteEntryPermanently);
    
    if (!firestoreId) {
        console.error('No firestoreId provided');
        alert('Error: No entry ID provided');
        return;
    }

    if (!window.journalApp) {
        console.error('journalApp not available');
        alert('Error: App not ready. Please refresh the page.');
        return;
    }

    if (typeof window.journalApp.deleteEntryPermanently !== 'function') {
        console.error('deleteEntryPermanently is not a function');
        alert('Error: Delete function not available. Please refresh the page.');
        return;
    }

    const entries = window.journalApp.entries || [];
    console.log('Looking for entry in', entries.length, 'entries');
    const entry = entries.find(e => e.firestoreId === firestoreId);
    
    if (!entry) {
        console.error('Entry not found with ID:', firestoreId);
        alert('Error: Entry not found');
        return;
    }

    console.log('Found entry:', entry.title);
    const confirmed = confirm(`Permanently delete "${entry.title}"? This cannot be undone.`);
    console.log('User confirmed:', confirmed);
    
    if (confirmed) {
        try {
            console.log('Calling deleteEntryPermanently...');
            await window.journalApp.deleteEntryPermanently(firestoreId);
            console.log('Delete successful - waiting for real-time update');
            // renderTrash() will be called automatically by the real-time listener
        } catch (error) {
            console.error('Error deleting entry:', error);
            alert('Error deleting entry: ' + (error.message || 'Unknown error'));
            window.journalApp.showNotification('Error deleting entry: ' + (error.message || 'Unknown error'), true);
        }
    }
};

window.editEntry = function(firestoreId) {
    console.log('editEntry called with ID:', firestoreId);
    
    const entries = window.journalApp?.entries || [];
    const entry = entries.find(e => e.firestoreId === firestoreId);
    if (!entry) {
        console.error('Entry not found');
        return;
    }

    const modal = document.getElementById('entryModal');
    const modalContent = document.getElementById('modalContent');

    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>Edit Entry</h2>
            <button onclick="window.closeModal()" class="close-button">&times;</button>
        </div>
        <form id="editForm">
            <div class="form-group">
                <label for="editTitle">Title</label>
                <input type="text" id="editTitle" value="${entry.title}" required>
            </div>
            <div class="form-group">
                <label for="editTags">Tags (start with #)</label>
                <input type="text" id="editTags" value="${entry.tags.join(' ')}" placeholder="Add tags with # (e.g. #happy #journal)">
            </div>
            <div class="form-group">
                <label for="editContent">Content</label>
                <textarea id="editContent" required>${entry.content}</textarea>
            </div>
            ${entry.mediaData ? '<div class="media-preview">' + createMediaElement(entry.mediaData) + '</div>' : ''}
            <div class="form-controls">
                <button type="submit">Save Changes</button>
                <button type="button" onclick="window.closeModal()">Cancel</button>
            </div>
        </form>
    `;

    modal.style.display = 'block';
    document.getElementById('editTitle').focus();

    document.getElementById('editForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const updatedData = {
            title: document.getElementById('editTitle').value.trim(),
            tags: document.getElementById('editTags').value
                .split(' ')
                .filter(tag => tag.startsWith('#'))
                .map(tag => tag.trim()),
            content: document.getElementById('editContent').value.trim()
        };

        try {
            await window.journalApp.updateEntryInFirestore(firestoreId, updatedData);
            window.closeModal();
            // renderTrash() will be called automatically by the real-time listener
        } catch (error) {
            console.error('Error updating entry:', error);
            window.journalApp.showNotification('Error updating entry', true);
        }
    });
};

window.closeModal = function() {
    console.log('closeModal called');
    const modal = document.getElementById('entryModal');
    if (modal) {
        modal.style.display = 'none';
    }
};