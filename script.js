// Import Supabase client
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Initialize Supabase - replace with your own values
const supabaseUrl = 'https://skbipeootynhnhrvgjzh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNrYmlwZW9vdHluaG5ocnZnanpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA3MTQ1MDUsImV4cCI6MjA1NjI5MDUwNX0.6l4J-7SDlBCwMorCWgVwvlba55AdGISaaGi4JPGs0XQ';
const supabase = createClient(supabaseUrl, supabaseKey);

// DOM elements - Authentication
const authContainer = document.getElementById('auth-container');
const userContainer = document.getElementById('user-container');
const appContent = document.getElementById('app-content');
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const signupConfirmPassword = document.getElementById('signup-confirm-password');
const loginButton = document.getElementById('login-button');
const signupButton = document.getElementById('signup-button');
const logoutButton = document.getElementById('logout-button');
const userEmail = document.getElementById('user-email');
const storageUsed = document.getElementById('storage-used');
const detectionCount = document.getElementById('detection-count');

// DOM elements - Main app
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startCameraBtn = document.getElementById('start-camera');
const stopCameraBtn = document.getElementById('stop-camera');
const captureBtn = document.getElementById('capture');
const statusEl = document.getElementById('status');
const detectionListEl = document.getElementById('detection-list');
const imageQuality = document.getElementById('image-quality');
const imageMaxSize = document.getElementById('image-max-size');

// Global variables
let model;
let detections = [];
let stream = null;
let isRunning = false;
let animationId = null;
let currentUser = null;

// Initialize the application
async function init() {
    try {
        // Check for existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            currentUser = session.user;
            userEmail.textContent = `Logged in as: ${currentUser.email}`;
            showAppInterface();
            await loadUserUsage(currentUser.id);
        } else {
            showLoginInterface();
        }
        
        // Load TensorFlow model
        await loadModel();
        
        // Set up auth event listeners
        setupAuthListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        setStatus(`Initialization error: ${error.message}. Please reload the page.`, 'error');
    }
}

// Load TensorFlow model
async function loadModel() {
    try {
        setStatus('Loading object detection model...', 'info');
        model = await cocoSsd.load();
        setStatus('Model loaded successfully. Ready to start camera.', 'success');
    } catch (error) {
        console.error('Error loading model:', error);
        setStatus(`Error loading model: ${error.message}. Please reload the page.`, 'error');
    }
}

// Set up authentication event listeners
function setupAuthListeners() {
    // Tab switching
    loginTab.addEventListener('click', () => {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
    });
    
    signupTab.addEventListener('click', () => {
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
        signupForm.style.display = 'block';
        loginForm.style.display = 'none';
    });
    
    // Login button
    loginButton.addEventListener('click', async () => {
        const email = loginEmail.value;
        const password = loginPassword.value;
        
        if (!email || !password) {
            setStatus('Please enter both email and password', 'error');
            return;
        }
        
        try {
            setStatus('Logging in...', 'info');
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            if (error) throw error;
            
            currentUser = data.user;
            userEmail.textContent = `Logged in as: ${currentUser.email}`;
            showAppInterface();
            await loadUserUsage(currentUser.id);
        } catch (error) {
            console.error('Login error:', error);
            setStatus(`Login failed: ${error.message}`, 'error');
        }
    });
    
    // Signup button
    signupButton.addEventListener('click', async () => {
        const email = signupEmail.value;
        const password = signupPassword.value;
        const confirmPassword = signupConfirmPassword.value;
        
        if (!email || !password) {
            setStatus('Please enter both email and password', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            setStatus('Passwords do not match', 'error');
            return;
        }
        
        try {
            setStatus('Creating account...', 'info');
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password
            });
            
            if (error) throw error;
            
            // Initialize user usage record
            try {
                const { error: usageError } = await supabase
                    .from('usage')
                    .insert({
                        user_id: data.user.id,
                        storage_used: 0,
                        detection_count: 0
                    });
                
                if (usageError && !usageError.message.includes('duplicate')) throw usageError;
            } catch (usageError) {
                console.error('Error initializing usage:', usageError);
            }
            
            setStatus('Account created successfully! Please check your email for verification.', 'success');
            
            // Auto-login if email verification is not required
            if (data.user && !data.user.identities[0].identity_data.email_verified) {
                currentUser = data.user;
                userEmail.textContent = `Logged in as: ${currentUser.email}`;
                showAppInterface();
            }
        } catch (error) {
            console.error('Signup error:', error);
            setStatus(`Signup failed: ${error.message}`, 'error');
        }
    });
    
    // Logout button
    logoutButton.addEventListener('click', async () => {
        try {
            await supabase.auth.signOut();
            currentUser = null;
            showLoginInterface();
            stopCamera(); // Stop camera on logout
        } catch (error) {
            console.error('Logout error:', error);
            setStatus(`Logout failed: ${error.message}`, 'error');
        }
    });
    
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            userEmail.textContent = `Logged in as: ${currentUser.email}`;
            showAppInterface();
            loadUserUsage(currentUser.id);
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            showLoginInterface();
        }
    });
}

// Load user usage statistics
async function loadUserUsage(userId) {
    try {
        const { data, error } = await supabase
            .from('usage')
            .select('storage_used, detection_count')
            .eq('user_id', userId)
            .single();
        
        if (error) throw error;
        
        if (data) {
            storageUsed.textContent = `Storage used: ${(data.storage_used / (1024 * 1024)).toFixed(2)} MB`;
            detectionCount.textContent = `Detections saved: ${data.detection_count}`;
        } else {
            // Create usage record if it doesn't exist
            await supabase
                .from('usage')
                .insert({
                    user_id: userId,
                    storage_used: 0,
                    detection_count: 0
                });
            
            storageUsed.textContent = 'Storage used: 0 MB';
            detectionCount.textContent = 'Detections saved: 0';
        }
    } catch (error) {
        console.error('Error loading usage:', error);
    }
}

// Show login interface
function showLoginInterface() {
    authContainer.style.display = 'block';
    userContainer.style.display = 'none';
    appContent.style.display = 'none';
}

// Show main app interface
function showAppInterface() {
    authContainer.style.display = 'none';
    userContainer.style.display = 'block';
    appContent.style.display = 'block';
}

// Set status message
function setStatus(message, type = 'info') {
    statusEl.textContent = message;
    statusEl.className = type;
}

// Start camera
async function startCamera() {
    if (isRunning) return;
    
    try {
        setStatus('Requesting camera access...', 'info');
        
        const constraints = {
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };
        
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise(resolve => {
            video.onloadedmetadata = () => {
                resolve();
            };
        });
        
        // Start video playback
        await video.play();
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        isRunning = true;
        startCameraBtn.disabled = true;
        stopCameraBtn.disabled = false;
        captureBtn.disabled = false;
        
        setStatus('Camera active. Object detection running...', 'success');
        
        // Start detection loop
        detectObjects();
    } catch (error) {
        console.error('Error starting camera:', error);
        setStatus(`Camera access error: ${error.message}. Please check permissions.`, 'error');
    }
}

// Stop camera
function stopCamera() {
    if (!isRunning) return;
    
    // Stop animation loop
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    
    // Stop video tracks
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    
    // Clear video source
    video.srcObject = null;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Reset state
    isRunning = false;
    startCameraBtn.disabled = false;
    stopCameraBtn.disabled = true;
    captureBtn.disabled = true;
    
    setStatus('Camera stopped. Click "Start Camera" to begin again.', 'info');
}

// Detect objects in video stream
async function detectObjects() {
    if (!isRunning) return;
    
    try {
        // Perform detection
        detections = await model.detect(video);
        
        // Clear previous drawings
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw detections
        detections.forEach(detection => {
            const [x, y, width, height] = detection.bbox;
            
            // Draw bounding box
            ctx.strokeStyle = '#FF0000';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, width, height);
            
            // Draw label background
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            const textWidth = ctx.measureText(`${detection.class} ${Math.round(detection.score * 100)}%`).width;
            ctx.fillRect(x, y > 15 ? y - 15 : y, textWidth + 10, 15);
            
            // Draw label text
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.fillText(
                `${detection.class} ${Math.round(detection.score * 100)}%`,
                x + 5, y > 15 ? y - 5 : y + 10
            );
        });
        
        // Update detection list
        updateDetectionList(detections);
        
        // Continue detection loop
        animationId = requestAnimationFrame(detectObjects);
    } catch (error) {
        console.error('Detection error:', error);
        setStatus(`Detection error: ${error.message}. Trying to continue...`, 'error');
        
        // Try to continue despite error
        animationId = requestAnimationFrame(detectObjects);
    }
}

// Update detection list in UI
function updateDetectionList(detections) {
    // Sort detections by confidence
    const sortedDetections = [...detections].sort((a, b) => b.score - a.score);
    
    // Clear previous list
    detectionListEl.innerHTML = '';
    
    // Add header if detections exist
    if (sortedDetections.length > 0) {
        const header = document.createElement('h3');
        header.textContent = 'Detected Objects:';
        detectionListEl.appendChild(header);
        
        // Create list
        const list = document.createElement('ul');
        sortedDetections.forEach(detection => {
            const item = document.createElement('li');
            item.textContent = `${detection.class} (${Math.round(detection.score * 100)}% confidence)`;
            list.appendChild(item);
        });
        
        detectionListEl.appendChild(list);
    }
}

// Resize and optimize image
function resizeAndOptimizeImage(canvas, maxWidth, quality) {
    // If canvas is already smaller than maxWidth, just return the original
    if (canvas.width <= maxWidth) {
        return canvas.toDataURL('image/jpeg', quality);
    }
    
    // Create a new canvas for resizing
    const resizeCanvas = document.createElement('canvas');
    const resizeCtx = resizeCanvas.getContext('2d');
    
    // Calculate new dimensions
    const ratio = maxWidth / canvas.width;
    resizeCanvas.width = maxWidth;
    resizeCanvas.height = canvas.height * ratio;
    
    // Draw resized image
    resizeCtx.drawImage(canvas, 0, 0, resizeCanvas.width, resizeCanvas.height);
    
    // Return data URL
    return resizeCanvas.toDataURL('image/jpeg', quality);
}

// Send data to Supabase when capture button is clicked
async function captureAndSend() {
    if (!isRunning || !currentUser) {
        setStatus('Camera not active or user not logged in', 'error');
        return;
    }
    
    try {
        setStatus('Capturing and sending data to database...', 'info');
        captureBtn.disabled = true;
        
        // Get quality settings
        const quality = parseFloat(imageQuality.value);
        const maxWidth = parseInt(imageMaxSize.value);
        
        // Capture a frame from the video
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = video.videoWidth;
        captureCanvas.height = video.videoHeight;
        const captureCtx = captureCanvas.getContext('2d');
        captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
        
        // Draw bounding boxes on the captured image
        detections.forEach(detection => {
            const [x, y, width, height] = detection.bbox;
            captureCtx.strokeStyle = '#FF0000';
            captureCtx.lineWidth = 3;
            captureCtx.strokeRect(x, y, width, height);
            
            captureCtx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            captureCtx.font = '16px Arial';
            captureCtx.fillText(
                `${detection.class} ${Math.round(detection.score * 100)}%`,
                x + 5, y > 20 ? y - 5 : y + 15
            );
        });
        
        // Resize and optimize image
        const imageDataUrl = resizeAndOptimizeImage(captureCanvas, maxWidth, quality);
        
        // Roughly estimate the size of the base64 string
        const approximateSize = Math.round((imageDataUrl.length * 3) / 4);
        
        // Create a metadata object with class frequencies
        const classFrequency = {};
        detections.forEach(d => {
            if (classFrequency[d.class]) {
                classFrequency[d.class]++;
            } else {
                classFrequency[d.class] = 1;
            }
        });
        
        // Add to Supabase
        const timestamp = Date.now();
        const { data, error } = await supabase
            .from('detections')
            .insert({
                user_id: currentUser.id,
                email: currentUser.email,
                timestamp: new Date().toISOString(),
                captured_at: timestamp,
                detections: detections.map(d => ({
                    class: d.class,
                    confidence: d.score,
                    bbox: d.bbox
                })),
                class_frequency: classFrequency,
                total_objects_detected: detections.length,
                image_data: imageDataUrl,
                image_size: approximateSize,
                image_quality: quality,
                image_width: maxWidth
            });
        
        if (error) throw error;
        
        // Update usage statistics
        const { error: usageError } = await supabase
            .from('usage')
            .update({
                storage_used: supabase.rpc('increment', { x: approximateSize }),
                detection_count: supabase.rpc('increment', { x: 1 }),
                last_updated: new Date().toISOString()
            })
            .eq('user_id', currentUser.id);
        
        if (usageError) console.error('Error updating usage:', usageError);
        
        // Reload usage statistics
        await loadUserUsage(currentUser.id);
        
        setStatus(`Data sent successfully!`, 'success');
        setTimeout(() => {
            if (isRunning) {
                setStatus('Camera active. Object detection running...', 'success');
                captureBtn.disabled = false;
            }
        }, 3000);
    } catch (error) {
        console.error('Error capturing and sending data:', error);
        setStatus(`Error sending data: ${error.message}. Please try again.`, 'error');
        captureBtn.disabled = false;
    }
}

// Event listeners
startCameraBtn.addEventListener('click', startCamera);
stopCameraBtn.addEventListener('click', stopCamera);
captureBtn.addEventListener('click', captureAndSend);

// Start the application
init();