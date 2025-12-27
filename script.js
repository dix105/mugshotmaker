document.addEventListener('DOMContentLoaded', () => {
    
    /* =========================================
       GLOBAL CONFIG & STATE
       ========================================= */
    const CONFIG = {
        userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
        projectId: 'dressr',
        effectId: 'mugshot',
        model: 'image-effects', // or 'video-effects'
        toolType: 'image-effects',
        apiBase: 'https://api.chromastudio.ai',
        uploadBase: 'https://core.faceswapper.ai/media',
        assetsBase: 'https://assets.dressr.ai'
    };

    let currentUploadedUrl = null;
    let isUploading = false;

    /* =========================================
       HELPER FUNCTIONS (API & UTILS)
       ========================================= */
    
    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // UI Helper: Update status text/loading state
    function updateStatus(text) {
        const generateBtn = document.getElementById('generate-btn');
        const loadingPercent = document.querySelector('.loading-percent');
        
        if (generateBtn) {
            generateBtn.textContent = text;
        }
        if (loadingPercent && text.includes('...')) {
            loadingPercent.textContent = text;
        }
    }

    // UI Helper: Show Loading Screen
    function showLoading() {
        const loadingState = document.getElementById('loading-state');
        const emptyState = document.getElementById('empty-state');
        const resultImage = document.getElementById('result-final');
        const downloadBtn = document.getElementById('download-btn');
        
        if (loadingState) loadingState.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');
        if (resultImage) resultImage.classList.add('hidden');
        
        // Hide download button during processing
        if (downloadBtn) {
            downloadBtn.style.display = 'none';
        }
        
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.disabled = true;
        }
    }

    // UI Helper: Hide Loading Screen
    function hideLoading() {
        const loadingState = document.getElementById('loading-state');
        if (loadingState) loadingState.classList.add('hidden');
        
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.disabled = false;
        }
    }

    // UI Helper: Show Error
    function showError(message) {
        alert('Error: ' + message);
        console.error(message);
        hideLoading();
        updateStatus('TRY AGAIN');
    }

    // Upload file to CDN storage
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        const fileName = 'media/' + uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            `${CONFIG.uploadBase}/get-upload-url?fileName=${encodeURIComponent(fileName)}&projectId=${CONFIG.projectId}`,
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        const downloadUrl = `${CONFIG.assetsBase}/${fileName}`;
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        const isVideo = CONFIG.model === 'video-effects';
        const endpoint = isVideo ? `${CONFIG.apiBase}/video-gen` : `${CONFIG.apiBase}/image-gen`;
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json'
        };

        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl],
                effectId: CONFIG.effectId,
                userId: CONFIG.userId,
                removeWatermark: true,
                model: 'video-effects',
                isPrivate: true
            };
        } else {
            body = {
                model: CONFIG.model,
                toolType: CONFIG.toolType,
                effectId: CONFIG.effectId,
                imageUrl: imageUrl,
                userId: CONFIG.userId,
                removeWatermark: true,
                isPrivate: true
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // Poll job status
    async function pollJobStatus(jobId) {
        const isVideo = CONFIG.model === 'video-effects';
        const baseUrl = isVideo ? `${CONFIG.apiBase}/video-gen` : `${CONFIG.apiBase}/image-gen`;
        const POLL_INTERVAL = 2000;
        const MAX_POLLS = 60;
        
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${CONFIG.userId}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: { 'Accept': 'application/json, text/plain, */*' }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status');
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            updateStatus(`PROCESSING... (${Math.round((polls/MAX_POLLS)*100)}%)`);
            
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out');
    }

    // UI Helper: Show result media
    function showResultMedia(url) {
        const resultImg = document.getElementById('result-final');
        const container = document.getElementById('result-container');
        
        if (!container) return;
        
        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        const emptyState = document.getElementById('empty-state');
        
        if (emptyState) emptyState.classList.add('hidden');
        if (container) container.classList.remove('hidden');
        
        if (isVideo) {
            if (resultImg) resultImg.style.display = 'none';
            
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                video.className = resultImg ? resultImg.className : 'w-full h-auto rounded-lg';
                container.appendChild(video);
            }
            video.src = url;
            video.style.display = 'block';
        } else {
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            if (resultImg) {
                resultImg.style.display = 'block';
                resultImg.classList.remove('hidden');
                resultImg.crossOrigin = 'anonymous'; // CRITICAL
                resultImg.src = url;
            }
        }
    }

    // UI Helper: Prepare download button
    function showDownloadButton(url) {
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
            downloadBtn.disabled = false;
            downloadBtn.style.display = 'inline-flex'; // Restore display
        }
    }

    /* =========================================
       MAIN LOGIC HANDLERS
       ========================================= */

    async function handleFileSelect(file) {
        const previewContainer = document.getElementById('preview-container');
        const previewImage = document.getElementById('preview-image');
        const uploadContent = document.getElementById('upload-content');
        const generateBtn = document.getElementById('generate-btn');
        
        // 1. Immediate Local Preview (UX)
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if(previewImage) previewImage.src = e.target.result;
                if(uploadContent) uploadContent.classList.add('hidden');
                if(previewContainer) previewContainer.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }

        // 2. Start Upload
        try {
            isUploading = true;
            if(generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'UPLOADING...';
            }
            
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            isUploading = false;
            updateStatus('PROCESS EVIDENCE'); // Ready state
            
            if(generateBtn) generateBtn.disabled = false;
            
        } catch (error) {
            isUploading = false;
            updateStatus('UPLOAD FAILED');
            showError('Upload failed: ' + error.message);
        }
    }

    async function handleGenerate() {
        if (!currentUploadedUrl || isUploading) return;
        
        try {
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // 1. Submit
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            // 2. Poll
            const result = await pollJobStatus(jobData.jobId);
            
            // 3. Extract Result URL
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) throw new Error('No image URL in response');
            
            // 4. Update UI
            showResultMedia(resultUrl);
            showDownloadButton(resultUrl);
            updateStatus('PROCESS EVIDENCE'); // Reset button text
            hideLoading();
            
        } catch (error) {
            showError(error.message);
        }
    }

    /* =========================================
       WIRING & EVENT LISTENERS
       ========================================= */

    // Selectors
    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const generateBtn = document.getElementById('generate-btn');
    const resetBtn = document.getElementById('reset-btn');
    const removeBtn = document.getElementById('remove-upload');
    const downloadBtn = document.getElementById('download-btn');

    // 1. File Input Change
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // 2. Drag & Drop
    if (dropZone) {
        // Click to upload (unless clicking remove button)
        dropZone.addEventListener('click', (e) => {
            if (e.target !== removeBtn && fileInput) {
                fileInput.click();
            }
        });

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        dropZone.addEventListener('dragover', () => {
            dropZone.style.borderColor = 'var(--primary)';
            dropZone.style.background = 'rgba(0,255,65,0.1)';
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'var(--border)';
            dropZone.style.background = 'rgba(0,255,65,0.02)';
        });

        dropZone.addEventListener('drop', (e) => {
            dropZone.style.borderColor = 'var(--border)';
            dropZone.style.background = 'rgba(0,255,65,0.02)';
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // 3. Remove Upload / Reset Logic
    function performReset() {
        currentUploadedUrl = null;
        isUploading = false;
        
        if (fileInput) fileInput.value = '';
        const previewImage = document.getElementById('preview-image');
        if (previewImage) previewImage.src = '';
        
        const previewContainer = document.getElementById('preview-container');
        if (previewContainer) previewContainer.classList.add('hidden');
        
        const uploadContent = document.getElementById('upload-content');
        if (uploadContent) uploadContent.classList.remove('hidden');
        
        const resultImage = document.getElementById('result-final');
        if (resultImage) {
            resultImage.classList.add('hidden');
            resultImage.src = '';
        }

        const video = document.getElementById('result-video');
        if (video) video.style.display = 'none';
        
        const emptyState = document.getElementById('empty-state');
        if (emptyState) emptyState.classList.remove('hidden');
        
        const loadingState = document.getElementById('loading-state');
        if (loadingState) loadingState.classList.add('hidden');
        
        if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.textContent = 'PROCESS EVIDENCE';
        }
        
        if (downloadBtn) {
            downloadBtn.disabled = true;
            downloadBtn.dataset.url = '';
        }
    }

    if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            performReset();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', performReset);
    }

    // 4. Generate Button
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // 5. Download Button
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            try {
                // Fetch the file as a blob
                const response = await fetch(url, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (!response.ok) throw new Error('Fetch failed');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                // Determine extension
                const contentType = response.headers.get('content-type') || '';
                let extension = 'jpg';
                if (contentType.includes('video') || url.match(/\.(mp4|webm)/i)) extension = 'mp4';
                else if (contentType.includes('png')) extension = 'png';
                else if (contentType.includes('webp')) extension = 'webp';
                
                // Trigger download
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = `evidence_${generateNanoId(8)}.${extension}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (err) {
                console.error('Download error:', err);
                
                // Fallback: Canvas for images
                try {
                    const img = document.getElementById('result-final');
                    if (img && img.style.display !== 'none' && img.complete) {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        canvas.toBlob((blob) => {
                            if(blob) {
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = `evidence_${generateNanoId(8)}.png`;
                                link.click();
                            } else {
                                throw new Error('Canvas blob failed');
                            }
                        }, 'image/png');
                        return;
                    }
                } catch (canvasErr) {
                    console.error('Canvas fallback error:', canvasErr);
                }
                
                // Final Fallback: Open in new tab
                alert('Direct download blocked by browser. Opening in new tab - please right click and "Save As".');
                window.open(url, '_blank');
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    /* =========================================
       EXISTING UI LOGIC (Menu, FAQ, Animations)
       ========================================= */
    
    // Mobile Menu
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    if (menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.innerHTML = nav.classList.contains('active') ? '✕' : '☰';
        });
        document.querySelectorAll('header nav a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.innerHTML = '☰';
            });
        });
    }

    // FAQ Accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                faqItems.forEach(otherItem => {
                    if (otherItem !== item) {
                        otherItem.classList.remove('active');
                        const icon = otherItem.querySelector('.icon');
                        if (icon) icon.textContent = '+';
                    }
                });
                item.classList.toggle('active');
                const icon = item.querySelector('.icon');
                if (icon) icon.textContent = item.classList.contains('active') ? '-' : '+';
            });
        }
    });

    // Modals
    function openModal(modalId) {
        const modal = document.getElementById(modalId + '-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }
    function closeModal(modalId) {
        const modal = document.getElementById(modalId + '-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }
    document.querySelectorAll('[data-modal-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-modal-target');
            openModal(target);
        });
    });
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-modal-close');
            closeModal(target);
        });
    });
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }
        });
    });

    // Scroll Animations
    const observerOptions = { threshold: 0.1 };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.step-card, .gallery-item, .testimonial-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });

    const style = document.createElement('style');
    style.innerHTML = `
        .fade-in-up {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);
});