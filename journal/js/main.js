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
    enableIndexedDbPersistence
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// **New imports for Storage**
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit
const APP_VERSION = '0.8';

// Global state
let entriesCollectionRef;
let unsubscribeListener;
let db, userId, appId;
let storage;

// Initialize Firebase and get user info
function initializeFirebase() {
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    
    if (Object.keys(firebaseConfig).length === 0) {
        console.error('Firebase configuration is missing.');
        showNotification('Firebase configuration missing. Please check setup.');
        return false;
    }

    try {
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);

        onAuthStateChanged(auth, (user) => {
            if (user && !user.isAnonymous) {
                userId = user.uid;
                appId = 'journal-app'; // Default app ID
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
    
    // Set up real-time listener
    setupRealtimeListener();
}

// Real-time data listener
function setupRealtimeListener() {
    if (unsubscribeListener) {
        unsubscribeListener(); // Clean up existing listener
    }
    
    const q = query(entriesCollectionRef, orderBy('date', 'desc'));
    
    unsubscribeListener = onSnapshot(q, (snapshot) => {
        journalApp.entries = [];
        
        snapshot.forEach((docSnap) => {
            const entryData = docSnap.data();
            journalApp.entries.push({
                firestoreId: docSnap.id,
                ...entryData,
                date: entryData.date?.toDate ? entryData.date.toDate().toISOString() : entryData.date,
                lastModified: entryData.lastModified?.toDate ? entryData.lastModified.toDate().toISOString() : entryData.lastModified,
                deletedDate: entryData.deletedDate?.toDate ? entryData.deletedDate.toDate().toISOString() : entryData.deletedDate
            });
        });
        
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

// Utility: upload a file to Storage and return URL
async function uploadFileToStorage(file, path) {
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
}

// Save new entry to Firestore (with media URL support)
async function saveEntryToFirestore(entryData) {
    if (!await checkAuth()) return;

    if (!entryData.title?.trim()) {
        throw new Error('Title is required');
    }
    if (!entryData.content?.trim()) {
        throw new Error('Content is required');
    }

    if (entryData.videoLink) {
        const validVideoUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|drive\.google\.com).+$/;
        if (!validVideoUrl.test(entryData.videoLink)) {
            throw new Error('Invalid video URL. Only YouTube and Google Drive links are supported.');
        }
    }

    try {
        const docData = {
            ...entryData,
            date: serverTimestamp(),
            userId: userId,
            lastModified: serverTimestamp()
        };

        const docRef = await addDoc(entriesCollectionRef, docData);
        showNotification('Loading...');
        return docRef.id;
    } catch (error) {
        console.error('Error saving entry:', error);
        showNotification('Error saving entry to cloud', true);
        throw error;
    }
}

// Update existing entry in Firestore
async function updateEntryInFirestore(firestoreId, updatedData) {
    try {
        const docRef = doc(entriesCollectionRef, firestoreId);
        const updateData = {
            ...updatedData,
            lastModified: serverTimestamp(),
            userId: userId
        };
        await updateDoc(docRef, updateData);
        showNotification('Entry updated successfully, please refresh the page');
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
            deletedDate: serverTimestamp(),
            userId: userId
        });
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

// Permanently delete entry
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

// Image compression utility (similar to before)
function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > 800) {
                    height = height * (800 / width);
                    width = 800;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Sorting, notifications, backward compatibility, cleanup, auth checks, etc.

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
    }, 3000);
}

function getFromLocalStorage() {
    console.warn('getFromLocalStorage is deprecated. Use journalApp.entries instead.');
    return journalApp.entries || [];
}

function saveToLocalStorage(entries) {
    console.warn('saveToLocalStorage is deprecated. Use Firestore functions instead.');
    return false;
}

function cleanup() {
    if (unsubscribeListener) {
        unsubscribeListener();
        unsubscribeListener = null;
    }
}

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

document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
});

window.addEventListener('beforeunload', cleanup);

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('An unexpected error occurred. Please try again.', true);
});

window.onerror = function(msg, url, line, col, error) {
    console.error('Global error:', {msg, url, line, col, error});
    showNotification('An unexpected error occurred. Please try again.', true);
    return false;
};

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
    compressImage,
    getFromLocalStorage,
    saveToLocalStorage,
    // new Storage helper
    uploadFileToStorage
};
