// Firebase Firestore imports
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot, 
    query, 
    orderBy,
    serverTimestamp,
    enableIndexedDbPersistence,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit
const MAX_COMPRESSED_SIZE = 1 * 1024 * 1024; // 1MB for Firestore (Firestore has ~1MB doc limit)
const APP_VERSION = '0.8';

// Global state
let entriesCollectionRef;
let unsubscribeListener;
let db, userId, appId;
let firebaseInitialized = false;

// Initialize Firebase and get user info
function initializeFirebase() {
    // Try to get config from parent directory or current directory
    let firebaseConfig;
    
    if (typeof __firebase_config !== 'undefined') {
        firebaseConfig = JSON.parse(__firebase_config);
        console.log('Firebase config loaded from __firebase_config');
    } else {
        console.error('Firebase configuration is missing.');
        showNotification('Firebase configuration missing. Please check setup.', true);
        return false;
    }

    if (Object.keys(firebaseConfig).length === 0) {
        console.error('Firebase configuration is empty.');
        showNotification('Firebase configuration missing. Please check setup.', true);
        return false;
    }

    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        db = getFirestore(app);
        firebaseInitialized = true;
        console.log('Firebase initialized successfully');

        onAuthStateChanged(auth, (user) => {
            if (user && !user.isAnonymous) {
                userId = user.uid;
                appId = 'journal-app';
                console.log('User authenticated:', userId);
                initializeFirestore();
            } else {
                console.warn('User not authenticated. Redirecting to landing page.');
                showNotification('Please sign in to access your journal.', true);
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 2000);
            }
        });

        return true;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        showNotification('Error initializing Firebase: ' + error.message, true);
        return false;
    }
}

// Initialize Firestore collection reference
function initializeFirestore() {
    if (!db || !userId || !appId) {
        console.error('Firebase not properly initialized or user not authenticated');
        return;
    }
    
    // Enable offline persistence
    enableIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
        } else if (err.code == 'unimplemented') {
            console.warn('The current browser does not support offline persistence');
        }
    });
    
    // Create the secure collection path
    entriesCollectionRef = collection(db, `users/${userId}/journal-entries`);
    console.log('Firestore collection reference created');
    
    // Set up real-time listener
    setupRealtimeListener();
}

// Real-time data listener
function setupRealtimeListener() {
    if (unsubscribeListener) {
        unsubscribeListener();
    }
    
    const q = query(entriesCollectionRef, orderBy('date', 'desc'));
    
    unsubscribeListener = onSnapshot(q, (snapshot) => {
        journalApp.entries = [];
        
        snapshot.forEach((doc) => {
            const entryData = doc.data();
            
            // Reconstruct mediaData object from flattened fields
            let mediaData = null;
            if (entryData.mediaType && entryData.mediaUrl) {
                mediaData = {
                    type: entryData.mediaType,
                    data: entryData.mediaUrl
                };
            }
            
            journalApp.entries.push({
                firestoreId: doc.id,
                ...entryData,
                mediaData: mediaData,
                date: entryData.date?.toDate ? entryData.date.toDate().toISOString() : entryData.date,
                lastModified: entryData.lastModified?.toDate ? entryData.lastModified.toDate().toISOString() : entryData.lastModified,
                deletedDate: entryData.deletedDate?.toDate ? entryData.deletedDate.toDate().toISOString() : entryData.deletedDate
            });
        });
        
        console.log('Entries loaded:', journalApp.entries.length);
        
        // Trigger UI updates if render functions exist
        if (typeof renderEntries === 'function') {
            renderEntries();
        }
        if (typeof renderTrash === 'function') {
            renderTrash();
        }
        if (typeof renderCalendar === 'function' && typeof currentView !== 'undefined' && currentView === 'calendar') {
            renderCalendar();
        }
    }, (error) => {
        console.error('Error in real-time listener:', error);
        showNotification('Error loading entries from cloud', true);
    });
}

// Save new entry to Firestore
async function saveEntryToFirestore(entryData) {
    if (!await checkAuth()) return;

    // Validate entry data
    if (!entryData.title?.trim()) {
        throw new Error('Title is required');
    }
    if (!entryData.content?.trim()) {
        throw new Error('Content is required');
    }

    // Validate video link if present
    if (entryData.videoLink) {
        const validVideoUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|drive\.google\.com).+$/;
        if (!validVideoUrl.test(entryData.videoLink)) {
            throw new Error('Invalid video URL. Only YouTube and Google Drive links are supported.');
        }
    }

    try {
        const now = Timestamp.now();
        
        // Flatten mediaData to avoid nested object issues
        let docData = {
            title: entryData.title,
            content: entryData.content,
            tags: entryData.tags || [],
            videoLink: entryData.videoLink || null,
            deleted: false,
            date: now,
            userId: userId,
            lastModified: now,
            mediaType: null,
            mediaUrl: null
        };
        
        // Check if media data exists and validate size
        if (entryData.mediaData && entryData.mediaData.data) {
            const dataSize = entryData.mediaData.data.length;
            console.log('Media data size:', Math.round(dataSize / 1024), 'KB');
            
            if (dataSize > MAX_COMPRESSED_SIZE) {
                throw new Error(`Image too large after compression (${Math.round(dataSize / 1024)}KB). Please use a smaller image or reduce quality.`);
            }
            
            docData.mediaType = entryData.mediaData.type;
            docData.mediaUrl = entryData.mediaData.data;
        }
        
        console.log('Attempting to save entry to Firestore');
        const docRef = await addDoc(entriesCollectionRef, docData);
        console.log('Entry saved with ID:', docRef.id);
        showNotification('Entry saved successfully!');
        return docRef.id;
    } catch (error) {
        console.error('Error saving entry:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        
        let errorMessage = error.message;
        if (error.code === 'invalid-argument') {
            errorMessage = 'Entry data is too large. Try using a smaller image or remove the image.';
        }
        
        showNotification('Error saving entry: ' + errorMessage, true);
        throw error;
    }
}

// Update existing entry in Firestore
async function updateEntryInFirestore(firestoreId, updatedData) {
    try {
        const docRef = doc(entriesCollectionRef, firestoreId);
        const updateData = {
            ...updatedData,
            lastModified: Timestamp.now(),
            userId: userId
        };
        
        await updateDoc(docRef, updateData);
        showNotification('Entry updated successfully!');
        return true;
    } catch (error) {
        console.error('Error updating entry:', error);
        showNotification('Error updating entry', true);
        throw error;
    }
}

// Move entry to trash (soft delete)
async function moveEntryToTrash(firestoreId) {
    if (!firestoreId) {
        throw new Error('No entry ID provided');
    }

    try {
        const docRef = doc(entriesCollectionRef, firestoreId);
        await updateDoc(docRef, {
            deleted: true,
            deletedDate: Timestamp.now(),
            userId: userId
        });
        showNotification('Entry moved to trash');
        return true;
    } catch (error) {
        console.error('Error moving entry to trash:', error);
        throw error;
    }
}

// Restore entry from trash
async function restoreEntryFromTrash(firestoreId) {
    try {
        const docRef = doc(entriesCollectionRef, firestoreId);
        await updateDoc(docRef, {
            deleted: false,
            deletedDate: null,
            userId: userId
        });
        showNotification('Entry restored');
        return true;
    } catch (error) {
        console.error('Error restoring entry:', error);
        showNotification('Error restoring entry', true);
        throw error;
    }
}

// Permanently delete entry from Firestore
async function deleteEntryPermanently(firestoreId) {
    try {
        const docRef = doc(entriesCollectionRef, firestoreId);
        await deleteDoc(docRef);
        showNotification('Entry permanently deleted');
        return true;
    } catch (error) {
        console.error('Error permanently deleting entry:', error);
        showNotification('Error deleting entry', true);
        throw error;
    }
}

// Improved image compression with size validation
function compressImage(file, maxSizeKB = 800) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('File must be an image'));
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions (max 800px width)
                const maxWidth = 800;
                if (width > maxWidth) {
                    height = height * (maxWidth / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Try different quality levels to get under size limit
                let quality = 0.7;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                
                // If still too large, reduce quality further
                while (dataUrl.length > maxSizeKB * 1024 && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }

                if (dataUrl.length > maxSizeKB * 1024) {
                    reject(new Error(`Unable to compress image below ${maxSizeKB}KB. Please use a smaller image.`));
                } else {
                    console.log(`Image compressed to ${Math.round(dataUrl.length / 1024)}KB at quality ${quality.toFixed(1)}`);
                    resolve(dataUrl);
                }
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function sortEntries(entries, sortBy = 'newest') {
    return [...entries].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });
}

function showNotification(message, isError = false) {
    let container = document.querySelector('.notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notifications-container';
        document.body.appendChild(container);
    }

    const notification = document.createElement('div');
    notification.className = 'notification';
    if (isError) notification.classList.add('error');
    notification.textContent = message;
    
    container.appendChild(notification);
    
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Cleanup function
function cleanup() {
    if (unsubscribeListener) {
        unsubscribeListener();
        unsubscribeListener = null;
    }
}

// Auth check
async function checkAuth() {
    const auth = getAuth();
    if (!auth.currentUser || auth.currentUser.isAnonymous) {
        showNotification('Please sign in to access your journal.', true);
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 1500);
        return false;
    }
    return true;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Firebase...');
    initializeFirebase();
});

// Clean up on page unload
window.addEventListener('beforeunload', cleanup);

// Error handling
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('An unexpected error occurred. Please try again.', true);
});

window.onerror = function(msg, url, line, col, error) {
    console.error('Global error:', {msg, url, line, col, error});
    showNotification('An unexpected error occurred. Please try again.', true);
    return false;
};

// Export global journalApp object
window.journalApp = {
    MAX_FILE_SIZE,
    APP_VERSION,
    entries: [],
    initializeFirebase,
    cleanup,
    checkAuth,
    saveEntryToFirestore,
    updateEntryInFirestore,
    moveEntryToTrash,
    restoreEntryFromTrash,
    deleteEntryPermanently,
    showNotification,
    sortEntries,
    compressImage
};