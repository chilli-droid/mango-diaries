let currentDate = new Date();
let currentView = 'list';

window.onload = async function() {
    await setupEventListeners();
    // Force immediate render of entries
    if (journalApp.entries && journalApp.entries.length > 0) {
        renderEntries();
    } else {
        // Wait for Firebase to load entries
        setTimeout(renderEntries, 1000);
    }
    renderCalendar();
};

function setupEventListeners() {
    document.getElementById('searchInput')?.addEventListener('input', handleSearch);
    document.getElementById('sortSlider')?.addEventListener('input', handleSort);
    document.getElementById('viewType')?.addEventListener('change', handleViewChange);
    document.querySelector('.close')?.addEventListener('click', closeModal);

    document.getElementById('prevMonth')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

function handleSearch() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const entries = journalApp.entries || [];
    const filteredEntries = entries.filter(entry =>
        !entry.deleted && (
            entry.title.toLowerCase().includes(searchTerm) ||
            entry.content.toLowerCase().includes(searchTerm) ||
            entry.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        )
    );
    renderEntries(filteredEntries);
}

function handleSort() {
    renderEntries();
}

function handleViewChange(e) {
    currentView = e.target.value;
    const calendarView = document.getElementById('calendarView');
    const entriesList = document.getElementById('entriesList');

    if (currentView === 'calendar') {
        calendarView.style.display = 'block';
        entriesList.style.display = 'none';
        renderCalendar();
    } else {
        calendarView.style.display = 'none';
        entriesList.style.display = 'block';
        renderEntries();
    }
}

function renderEntries(filteredEntries = null) {
    const entries = journalApp.entries || [];
    const entriesToRender = filteredEntries || entries.filter(e => !e.deleted);

    const sliderValue = document.getElementById('sortSlider')?.value || "1";
    const sortBy = sliderValue === "1" ? "newest" : "oldest";

    const sortedEntries = [...entriesToRender].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });

    const entriesList = document.getElementById('entriesList');
    if (!entriesList) return;

    entriesList.innerHTML = sortedEntries.length === 0
        ? '<p>No entries found.</p>'
        : sortedEntries.map(entry => createEntryHTML(entry)).join('');
}

function createEntryHTML(entry) {
    const mediaHTML = entry.mediaData ? createMediaElement(entry.mediaData) : '';
    const videoHTML = entry.videoLink ? createVideoElement(entry.videoLink) : '';
    const date = new Date(entry.date);
    const lastModified = entry.lastModified ? new Date(entry.lastModified) : null;

    return `
        <div class="entry" data-id="${entry.id}" data-firestore-id="${entry.firestoreId}">
            <h3>${entry.title}</h3>
            <small>Created: ${date.toLocaleString()}</small>
            ${lastModified ? `<small>Last modified: ${lastModified.toLocaleString()}</small>` : ''}
            <p class="tags">${entry.tags.map(tag => `<span class="tag">${tag}</span>`).join(' ')}</p>
            <p class="content">${entry.content}</p>
            <div class="media-container">${mediaHTML}${videoHTML}</div>
            <div class="entry-controls">
                <button onclick="viewEntry('${entry.firestoreId}')">View</button>
                <button onclick="editEntry('${entry.firestoreId}')">Edit</button>
                <button onclick="moveToTrash('${entry.firestoreId}')" class="trash-button">🗑️</button>
            </div>
        </div>
    `;
}

function createVideoElement(videoLink) {
    if (!videoLink) return '';
    
    try {
        let videoId = '';
        if (videoLink.includes('youtube.com/watch?v=')) {
            videoId = new URL(videoLink).searchParams.get('v');
        } else if (videoLink.includes('youtu.be/')) {
            videoId = videoLink.split('youtu.be/')[1]?.split('?')[0];
        }
        
        if (videoId) {
            return `
                <div class="video-container">
                    <iframe 
                        src="https://www.youtube.com/embed/${videoId}?enablejsapi=1"
                        class="modal-media rounded"
                        style="width: 100%; height: 300px;"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen>
                    </iframe>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error parsing video URL:', error);
    }
    return `<p><a href="${videoLink}" target="_blank" rel="noopener noreferrer">🔹 View Video</a></p>`;
}

function editEntry(firestoreId) {
    const entries = journalApp.entries || [];
    const entry = entries.find(e => e.firestoreId === firestoreId);
    if (!entry) return;

    const modal = document.getElementById('entryModal');
    const modalContent = document.getElementById('modalContent');

    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>Edit Entry</h2>
            <button onclick="closeModal()" class="close-button">&times;</button>
        </div>
        <form id="editForm">
            <div class="form-group">
                <label for="editTitle">Title</label>
                <input type="text" id="editTitle" value="${entry.title}" required>
            </div>
            <div class="form-group">
                <label for="editTags">Tags (start with #)</label>
                <input type="text" id="editTags" value="${entry.tags.join(' ')}"
                       placeholder="Add tags with # (e.g. #happy #journal)">
            </div>
            <div class="form-group">
                <label for="editContent">Content</label>
                <textarea id="editContent" required>${entry.content}</textarea>
            </div>
            <div class="form-group">
                <label for="editVideoLink">Video Link</label>
                <input type="url" id="editVideoLink" value="${entry.videoLink || ''}" placeholder="YouTube or Google Drive link">
            </div>
            <div class="media-preview">
                ${entry.mediaData ? createMediaElement(entry.mediaData) : ''}
                ${entry.videoLink ? createVideoElement(entry.videoLink) : ''}
            </div>
            <div class="form-controls">
                <button type="submit">Save Changes</button>
                <button type="button" onclick="closeModal()">Cancel</button>
            </div>
        </form>
    `;

    modal.style.display = 'block';
    document.getElementById('editTitle').focus();

    setupEditFormHandler(firestoreId);
}

function setupEditFormHandler(firestoreId) {
    const form = document.getElementById('editForm');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const updatedData = {
            title: document.getElementById('editTitle').value.trim(),
            tags: document.getElementById('editTags').value
                .split(' ')
                .filter(tag => tag.startsWith('#'))
                .map(tag => tag.trim()),
            content: document.getElementById('editContent').value.trim(),
            videoLink: document.getElementById('editVideoLink').value.trim() || null
        };

        try {
            await journalApp.updateEntryInFirestore(firestoreId, updatedData);
            closeModal();
        } catch (error) {
            console.error('Error updating entry:', error);
        }
    });
}

function renderCalendar() {
    const monthYear = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    document.getElementById('currentMonth').textContent = monthYear;

    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const calendarGrid = document.getElementById('calendarGrid');

    if (calendarGrid) {
        calendarGrid.innerHTML = createCalendarHTML(firstDay, lastDay);
    }
}

function createCalendarHTML(firstDay, lastDay) {
    const days = [];
    const entries = journalApp.entries || [];
    const activeEntries = entries.filter(e => !e.deleted);

    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    weekdays.forEach(day => {
        days.push(`<div class="calendar-header">${day}</div>`);
    });

    for (let i = 0; i < firstDay.getDay(); i++) {
        days.push('<div class="calendar-day empty"></div>');
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dayEntries = activeEntries.filter(e =>
            new Date(e.date).toDateString() === date.toDateString()
        );

        const hasEntries = dayEntries.length > 0;
        const isToday = date.toDateString() === new Date().toDateString();

        days.push(`
            <div class="calendar-day ${hasEntries ? 'has-entries' : ''} ${isToday ? 'today' : ''}"
                 ${hasEntries ? `onclick="showDayEntries('${date.toISOString()}')"` : ''}>
                <div class="day-content">
                    <span class="day-number">${day}</span>
                    ${hasEntries ? `<span class="entry-count">${dayEntries.length}</span>` : ''}
                </div>
            </div>
        `);
    }

    return days.join('');
}

// Make showDayEntries globally accessible
window.showDayEntries = function(dateString) {
    try {
        const date = new Date(dateString);
        const entries = journalApp.entries || [];
        const dayEntries = entries.filter(e =>
            !e.deleted &&
            new Date(e.date).toDateString() === date.toDateString()
        ).sort((a, b) => new Date(b.date) - new Date(a.date));

        const modal = document.getElementById('entryModal');
        const modalContent = document.getElementById('modalContent');

        modalContent.innerHTML = `
            <div class="modal-header">
                <h3>${date.toLocaleDateString()}</h3>
                <button onclick="closeModal()" class="close-button">&times;</button>
            </div>
            <div class="day-entries">
                ${dayEntries.map(entry => createEntryHTML(entry)).join('')}
            </div>
        `;

        modal.style.display = 'block';
    } catch (error) {
        console.error('Error showing day entries:', error);
        if (journalApp && journalApp.showNotification) {
            journalApp.showNotification('Error displaying entries', true);
        }
    }
}

function viewEntry(firestoreId) {
    const entries = journalApp.entries || [];
    const entry = entries.find(e => e.firestoreId === firestoreId);
    if (!entry) return;

    const modal = document.getElementById('entryModal');
    const modalContent = document.getElementById('modalContent');

    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>${entry.title}</h2>
            <button onclick="closeModal()" class="close-button">&times;</button>
        </div>
        <div class="entry-view">
            <small>Created: ${new Date(entry.date).toLocaleString()}</small>
            ${entry.lastModified ?
                `<small>Last modified: ${new Date(entry.lastModified).toLocaleString()}</small>` : ''}
            <p class="tags">${entry.tags.map(tag => `<span class="tag">${tag}</span>`).join(' ')}</p>
            <p class="content">${entry.content}</p>
            ${entry.mediaData ? createMediaElement(entry.mediaData) : ''}
            ${entry.videoLink ? createVideoElement(entry.videoLink) : ''}
        </div>
    `;

    modal.style.display = 'block';
}

function createMediaElement(mediaData) {
    if (!mediaData || !mediaData.data) return '';

    switch (mediaData.type) {
        case 'image':
            return `<img src="${mediaData.data}" class="modal-media rounded" alt="Entry image">`;
        case 'audio':
            return `<audio controls src="${mediaData.data}"></audio>`;
        default:
            return '';
    }
}

// Make moveToTrash globally accessible with custom confirm
window.moveToTrash = async function(firestoreId) {
    if (!firestoreId) {
        console.error('No firestoreId provided');
        return;
    }

    const confirmed = await window.customConfirm(
        'Are you sure you want to move this entry to trash?',
        'Move to Trash'
    );

    if (confirmed) {
        try {
            await window.journalApp.moveEntryToTrash(firestoreId);
            window.journalApp.showNotification('Entry moved to trash, please refresh the page.');
        } catch (error) {
            console.error('Error moving entry to trash:', error);
            window.journalApp.showNotification('Error moving to trash', true);
        }
    }
}

function closeModal() {
    const modal = document.getElementById('entryModal');
    if (modal) {
        modal.style.display = 'none';
    }
}