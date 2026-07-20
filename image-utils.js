/**
 * EduPath Lanka Global Image Utilities
 * Provides functions for normalizing, validating, and safely rendering image URLs,
 * with special support for GitHub raw image URLs.
 */

window.EduPathImageUtils = (function () {
    function normalizeImageUrl(url) {
        if (!url) return '';
        let cleanUrl = String(url).trim().replace(/\\/g, '/');

        if (!cleanUrl) return '';

        if (cleanUrl.startsWith('blob:')) return '';

        if (/^\s*(c:\\|\/)/i.test(cleanUrl)) return '';

        if (cleanUrl.includes('github.com') && cleanUrl.includes('/blob/')) {
            const githubStart = cleanUrl.indexOf('github.com');
            if (githubStart >= 0) {
                const remainder = cleanUrl.slice(githubStart + 'github.com'.length);
                cleanUrl = `https://raw.githubusercontent.com${remainder.replace('/blob/', '/').replace(/^\//, '/')}`;
            }
        }

        if (cleanUrl.includes('github.com') && cleanUrl.includes('/blob/')) {
            cleanUrl = cleanUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        }

        if (cleanUrl.includes('raw.githubusercontent.com') && cleanUrl.includes('?raw=true')) {
            cleanUrl = cleanUrl.replace('?raw=true', '');
        }

        const githubBlobMatch = cleanUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i);
        if (githubBlobMatch) {
            cleanUrl = `https://raw.githubusercontent.com/${githubBlobMatch[1]}/${githubBlobMatch[2]}/${githubBlobMatch[3]}`;
        }

        if (cleanUrl.includes('raw.githubusercontent.com') && cleanUrl.includes('?')) {
            const [base] = cleanUrl.split('?');
            cleanUrl = base;
        }

        return cleanUrl;
    }

    function isValidImageUrl(url) {
        if (!url) return false;
        const cleanUrl = String(url).trim();

        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
            return false;
        }

        const lowerUrl = cleanUrl.toLowerCase();

        if (lowerUrl.includes('raw.githubusercontent.com') ||
            lowerUrl.includes('user-images.githubusercontent.com') ||
            lowerUrl.includes('firebasestorage.googleapis.com')) {
            return true;
        }

        const urlWithoutQuery = lowerUrl.split('?')[0];
        const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];

        return validExtensions.some(ext => urlWithoutQuery.endsWith(ext));
    }

    function previewImageFromUrl(inputElement, previewContainer, errorElement) {
        if (!inputElement || !previewContainer) return;

        const previewImg = previewContainer.querySelector('img') || previewContainer;
        const showError = (message, isSuccess = false) => {
            if (errorElement) {
                errorElement.textContent = message;
                errorElement.style.display = 'block';
                errorElement.className = isSuccess ? 'image-url-success' : 'image-url-error';
            }
            previewContainer.classList.toggle('has-error', !isSuccess);
            previewContainer.classList.toggle('has-success', isSuccess);
        };

        inputElement.addEventListener('input', (e) => {
            const rawUrl = String(e.target.value || '').trim();

            if (!rawUrl) {
                previewImg.style.display = 'none';
                if (errorElement) {
                    errorElement.style.display = 'none';
                    errorElement.className = 'image-url-error';
                }
                previewContainer.classList.remove('has-error', 'has-success');
                return;
            }

            const cleanUrl = normalizeImageUrl(rawUrl);

            if (!isValidImageUrl(cleanUrl)) {
                previewImg.style.display = 'none';
                showError('Please enter a valid public image URL. For GitHub images, use the raw image link.', false);
                return;
            }

            if (errorElement) errorElement.style.display = 'none';
            previewContainer.classList.remove('has-error', 'has-success');

            previewImg.onload = () => {
                previewImg.style.display = 'block';
                showError('Image loaded successfully!', true);
            };

            previewImg.onerror = () => {
                previewImg.style.display = 'none';
                showError('Image could not be loaded. Make sure the URL is public and points to an image.', false);
            };

            previewImg.src = cleanUrl;
        });

        if (inputElement.value) {
            inputElement.dispatchEvent(new Event('input'));
        }
    }

    /**
     * Resolves the best available image URL from a data record based on its type.
     */
    function getBestImageUrl(record, type) {
        if (!record) return '';
        
        let url = '';
        switch (type) {
            case 'institute':
                url = record.instituteLogoUrl || record.logoUrl || record.imageUrl || '';
                break;
            case 'mentor':
            case 'student':
                url = record.photoURL || record.profileImageUrl || record.avatarUrl || '';
                break;
            case 'course':
                url = record.courseImageUrl || record.imageUrl || record.thumbnailUrl || '';
                break;
            case 'scholarship':
                url = record.imageUrl || record.sponsorLogoUrl || record.scholarshipImage || '';
                break;
            case 'opportunity':
                url = record.imageUrl || record.posterUrl || record.opportunityImageUrl || '';
                break;
            case 'event':
                url = record.imageUrl || record.posterUrl || record.eventImageUrl || '';
                break;
            default:
                url = record.imageUrl || record.photoURL || '';
        }
        return normalizeImageUrl(url);
    }

    /**
     * Applies a fallback to an image element (initials or icon) if it fails to load or is empty.
     */
    function applyImageFallback(imgElement, fallbackText, fallbackType) {
        if (!imgElement) return;

        function showFallback() {
            let fallbackDiv = imgElement.nextElementSibling;
            if (!fallbackDiv || !fallbackDiv.classList.contains('image-placeholder')) {
                fallbackDiv = document.createElement('div');
                fallbackDiv.className = `image-placeholder placeholder-${fallbackType || 'default'}`;
                if (imgElement.parentNode) {
                    imgElement.parentNode.insertBefore(fallbackDiv, imgElement.nextSibling);
                }
            }

            if (['mentor', 'student', 'institute'].includes(fallbackType)) {
                fallbackDiv.textContent = getInitials(fallbackText);
            } else {
                fallbackDiv.innerHTML = getIconForType(fallbackType);
            }

            const computedStyle = window.getComputedStyle(imgElement);
            fallbackDiv.style.width = imgElement.style.width || computedStyle.width || '100%';
            fallbackDiv.style.height = imgElement.style.height || computedStyle.height || '200px';
            fallbackDiv.style.borderRadius = imgElement.style.borderRadius || computedStyle.borderRadius || '0';
            fallbackDiv.style.display = 'flex';
            imgElement.style.display = 'none';
        }

        if (!imgElement.getAttribute('src') || imgElement.getAttribute('src') === '') {
            showFallback();
            return;
        }

        imgElement.onerror = () => showFallback();
        if (imgElement.complete && imgElement.naturalHeight === 0) {
            showFallback();
        }
    }

    function getInitials(name) {
        if (!name) return '??';
        const parts = name.trim().split(' ');
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function getIconForType(type) {
        const icons = {
            course: '<i class="fas fa-book"></i>',
            opportunity: '<i class="fas fa-star"></i>',
            scholarship: '<i class="fas fa-award"></i>',
            event: '<i class="fas fa-calendar-alt"></i>',
            default: '<i class="fas fa-image"></i>'
        };
        return icons[type] || icons.default;
    }

    /**
     * Copies a URL to the clipboard and shows a toast.
     */
    function copyImageUrl(url) {
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
            // Try to find a toast container, or create a simple one
            let toast = document.getElementById('copy-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'copy-toast';
                toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:5px;z-index:9999;font-size:14px;opacity:0;transition:opacity 0.3s;';
                document.body.appendChild(toast);
            }
            toast.textContent = 'Image URL copied.';
            toast.style.opacity = '1';
            setTimeout(() => { toast.style.opacity = '0'; }, 3000);
        }).catch(err => {
            console.error('Failed to copy URL: ', err);
        });
    }

    // Expose functions
    return {
        normalizeImageUrl,
        isValidImageUrl,
        previewImageFromUrl,
        getBestImageUrl,
        applyImageFallback,
        copyImageUrl
    };
})();
