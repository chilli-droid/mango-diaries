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
        try {
            firebaseConfig = JSON.parse(__firebase_config);
            console.log('Firebase config loaded from __firebase_config');
        } catch (error) {
            console.error('Error parsing Firebase config:', error);
            showNotification('System configuration error. Please try again later.', true);
            return false;
        }
    } else {
        console.error('Firebase configuration is missing.');
        showNotification('System configuration missing. Please try again later.', true);
        return false;
    }

    if (Object.keys(firebaseConfig).length === 0) {
        console.error('Firebase configuration is empty.');
        showNotification('System configuration error. Please try again later.', true);
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
        showNotification('System initialization error. Please try again later.', true);
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
        showNotification('Error loading entries. Please check your connection.', true);
    });
}

// Save new entry to Firestore - SIMPLIFIED VERSION
async function saveEntryToFirestore(entryData) {
    if (!await checkAuth()) {
        throw new Error('Not authenticated');
    }

    // Basic validation
    if (!entryData.title?.trim()) {
        throw new Error('Title is required');
    }
    if (!entryData.content?.trim()) {
        throw new Error('Content is required');
    }

    try {
        const now = Timestamp.now();
        
        // Create simple document data without complex media handling first
        const docData = {
            title: entryData.title.trim(),
            content: entryData.content.trim(),
            tags: entryData.tags || [],
            videoLink: entryData.videoLink || null,
            deleted: false,
            date: now,
            userId: userId,
            lastModified: now
        };
        
        // Only add media if it exists and is small enough
        if (entryData.mediaData && entryData.mediaData.data) {
            const dataSize = entryData.mediaData.data.length;
            console.log('Media data size:', Math.round(dataSize / 1024), 'KB');
            
            if (dataSize <= MAX_COMPRESSED_SIZE) {
                docData.mediaType = entryData.mediaData.type;
                docData.mediaUrl = entryData.mediaData.data;
            } else {
                console.warn('Media too large, skipping:', dataSize, 'bytes');
                showNotification('Media file was too large and was not saved', true);
            }
        }
        
        console.log('Saving entry to Firestore:', {
            title: docData.title,
            contentLength: docData.content.length,
            hasMedia: !!docData.mediaType,
            tags: docData.tags.length
        });
        
        const docRef = await addDoc(entriesCollectionRef, docData);
        console.log('✅ Entry saved successfully with ID:', docRef.id);
        showNotification('Entry saved successfully!');
        return docRef.id;
        
    } catch (error) {
        console.error('❌ Error saving entry:', error);
        console.error('Error details:', error.code, error.message);
        
        let errorMessage = 'Failed to save entry. Please try again.';
        
        if (error.code === 'permission-denied') {
            errorMessage = 'Permission denied. Please check if you are signed in.';
        } else if (error.code === 'unavailable') {
            errorMessage = 'Network error. Please check your internet connection.';
        } else if (error.message.includes('quota')) {
            errorMessage = 'Storage quota exceeded. Please try with a smaller image.';
        }
        
        showNotification(errorMessage, true);
        throw error;
    }
}

// Update existing entry in Firestore
async function updateEntryInFirestore(firestoreId, updatedData) {
    try {
        const docRef = doc(entriesCollectionRef, firestoreId);
        const updateData = {
            ...updatedData,
            lastModified: Timestamp.now()
        };
        
        await updateDoc(docRef, updateData);
        showNotification('Entry updated successfully!');
        return true;
    } catch (error) {
        console.error('Error updating entry:', error);
        showNotification('Error updating entry. Please try again.', true);
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
            deletedDate: Timestamp.now()
        });
        showNotification('Entry moved to trash');
        return true;
    } catch (error) {
        console.error('Error moving entry to trash:', error);
        showNotification('Error moving entry to trash. Please try again.', true);
        throw error;
    }
}

// Restore entry from trash
async function restoreEntryFromTrash(firestoreId) {
    try {
        const docRef = doc(entriesCollectionRef, firestoreId);
        await updateDoc(docRef, {
            deleted: false,
            deletedDate: null
        });
        showNotification('Entry restored');
        return true;
    } catch (error) {
        console.error('Error restoring entry:', error);
        showNotification('Error restoring entry. Please try again.', true);
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
        showNotification('Error deleting entry. Please try again.', true);
        throw error;
    }
}

// Improved image compression with better error handling
function compressImage(file, maxSizeKB = 800) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) {
            reject(new Error('Please select a valid image file'));
            return;
        }

        // Check file size first
        if (file.size > MAX_FILE_SIZE) {
            reject(new Error(`Image is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 5MB.`));
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate new dimensions (max 1200px width for better quality)
                const maxWidth = 1200;
                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                
                // Improve image quality
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                ctx.drawImage(img, 0, 0, width, height);

                // Start with higher quality and reduce if needed
                let quality = 0.8;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                
                // If still too large, reduce quality gradually
                let attempts = 0;
                while (dataUrl.length > maxSizeKB * 1024 && quality > 0.3 && attempts < 5) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                    attempts++;
                }

                const finalSizeKB = Math.round(dataUrl.length / 1024);
                console.log(`Image compressed to ${finalSizeKB}KB at quality ${quality.toFixed(1)}`);

                if (dataUrl.length > maxSizeKB * 1024) {
                    reject(new Error(`Image is too large after compression (${finalSizeKB}KB). Please use a smaller image.`));
                } else {
                    resolve(dataUrl);
                }
            };
            img.onerror = () => reject(new Error('Failed to process the image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Failed to read the image file'));
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
    // Create notification container if it doesn't exist
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
    
    // Animate in
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });

    // Auto remove after delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
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