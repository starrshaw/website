// ==================== STATE ==================== 
let portfolioProjects = [];
let fineArtProjects = [];
let filteredProjects = [];
let activeModalProjects = [];
let currentModalIndex = 0;
let currentProjectImages = [];
const ADMIN_OVERRIDES_KEY = 'starrshawPortfolioAdminOverridesV1';
const FINE_ART_GALLERY_KEY = 'starrshawFineArtGalleryV1';
const TECH_ART_KEY = 'starrshawTechArtEntriesV1';
const SITE_CONTENT_KEY = 'starrshawSiteContentV1';
let revealObserver = null;
let statsAnimated = false;
let landingYoutubeSeed = [];
let techArtSeed = [];
let heroVideoRevealTimer = null;
let activeHeroVideoFrame = null;
let activeHeroVideoMount = null;
let heroYoutubeStateListenerAttached = false;
const isAdminEmbeddedPreview = new URLSearchParams(window.location.search).get('adminPreview') === '1';

const DEFAULT_TECH_ART_ITEMS = [
    {
        title: 'GameLift Streams Web Application',
        description: 'Sample cloud-streaming web app for game delivery patterns and technical integration reference.',
        repoUrl: 'https://github.com/aws-samples/sample-gameliftstreams-web-application',
        thumbnail: 'https://avatars.githubusercontent.com/u/2232217?s=400&v=4',
    },
];

// BroadcastChannel for real-time sync with Admin
const syncChannel = new BroadcastChannel('portfolio-admin-sync');

// ==================== INITIALIZATION ==================== 
document.addEventListener('DOMContentLoaded', async () => {
    await loadProjects();
    applySiteContent();
    populateCategoryFilter();
    renderPortfolioGrid();
    renderFineArtGrid();
    renderTechArtGrid();
    openPreviewFromUrl();
    setupBackToTopButton();
    setupEventListeners();
    updateNavigation();
    initializeMotionAndStats();
    
    // Disable right-click and drag on all images
    document.body.addEventListener('contextmenu', function(e) {
        if (e.target.tagName === 'IMG') {
            e.preventDefault();
        }
    });
    document.body.addEventListener('dragstart', function(e) {
        if (e.target.tagName === 'IMG') {
            e.preventDefault();
        }
    });
});

function openPreviewFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const previewId = String(params.get('previewId') || '').trim();
    if (!previewId) {
        return;
    }

    const previewType = params.get('previewType') === 'gallery' ? 'gallery' : 'project';
    const list = previewType === 'gallery' ? fineArtProjects : portfolioProjects;
    const index = list.findIndex((item) => String(item?.id || '').trim() === previewId);
    if (index < 0) {
        return;
    }

    openModal(list, index);
}

// ==================== LOAD PROJECTS ==================== 
async function loadProjects() {
    try {
        const cacheBust = `v=${Date.now()}`;
        const [portfolioResponse, galleryResponse, playlistResponse, techArtResponse] = await Promise.all([
            fetch(`data/projects.json?${cacheBust}`, { cache: 'no-store' }),
            fetch(`data/gallery.json?${cacheBust}`, { cache: 'no-store' }),
            fetch(`data/landing_youtube_playlist.json?${cacheBust}`, { cache: 'no-store' }),
            fetch(`data/tech_art.json?${cacheBust}`, { cache: 'no-store' }),
        ]);

        const baseProjects = await portfolioResponse.json();
        const seedGallery = await galleryResponse.json();
        const playlistPayload = playlistResponse.ok ? await playlistResponse.json() : { videos: [] };
        const techArtPayload = techArtResponse.ok ? await techArtResponse.json() : [];
        const seedPlaylist = Array.isArray(playlistPayload)
            ? playlistPayload
            : (Array.isArray(playlistPayload?.videos) ? playlistPayload.videos : []);

        portfolioProjects = applyAdminOverrides(baseProjects);
        filteredProjects = [...portfolioProjects];
        fineArtProjects = loadFineArtGallery(seedGallery);
        landingYoutubeSeed = normalizeLandingYoutubePlaylist(seedPlaylist);
        techArtSeed = normalizeTechArtItems(techArtPayload);
        console.log(`✓ Loaded ${portfolioProjects.length} portfolio projects and ${fineArtProjects.length} fine art items`);
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

function normalizeTechArtItems(items) {
    const list = Array.isArray(items) ? items : [];

    return list
        .map((entry, index) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }

            const id = String(entry.id ?? `tech-entry-${index}`).trim() || `tech-entry-${index}`;
            const title = String(entry.title ?? '').trim() || 'Untitled';
            const description = String(entry.description ?? '').trim();
            const repoUrl = String(entry.repoUrl ?? entry.url ?? '').trim();
            const thumbnail = String(entry.thumbnail ?? '').trim();

            return { id, title, description, repoUrl, thumbnail };
        })
        .filter(Boolean);
}

function mergeTechArtItems(primaryItems, fallbackItems) {
    const primary = Array.isArray(primaryItems) ? primaryItems : [];
    const fallback = Array.isArray(fallbackItems) ? fallbackItems : [];
    const merged = [];
    const seen = new Set();

    [...primary, ...fallback].forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            return;
        }

        const idKey = String(item.id || '').trim();
        const repoKey = String(item.repoUrl || '').trim().toLowerCase();
        const titleKey = String(item.title || '').trim().toLowerCase();
        const dedupeKey = idKey || repoKey || `${titleKey}::${index}`;

        if (!dedupeKey || seen.has(dedupeKey)) {
            return;
        }

        seen.add(dedupeKey);
        merged.push(item);
    });

    return merged;
}

// ==================== CATEGORY FILTER ==================== 
function populateCategoryFilter() {
    const categories = [...new Set(portfolioProjects.map(p => p.category))].sort();
    const select = document.getElementById('categoryFilter');
    select.innerHTML = '<option value="">All Categories</option>';
    
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
}

function filterByCategory(category) {
    if (!category) {
        filteredProjects = [...portfolioProjects];
    } else {
        filteredProjects = portfolioProjects.filter(p => p.category === category);
    }
    renderPortfolioGrid();
}

function searchProjects(query) {
    const q = query.toLowerCase();
    filteredProjects = portfolioProjects.filter(p => 
        p.title.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
    renderPortfolioGrid();
}

// ==================== RENDER GALLERY ==================== 
function renderPortfolioGrid() {
    const grid = document.getElementById('portfolioGrid');
    grid.innerHTML = '';
    
    if (filteredProjects.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #b0b0b0; padding: 60px 20px;">No portfolio projects found.</p>';
        return;
    }
    
    filteredProjects.forEach((project, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item reveal-item';
        item.onclick = () => openModal(filteredProjects, index);

        const candidates = getThumbnailCandidates(project);
        const thumb = candidates[0] || '';

        item.innerHTML = `
            <img 
                src="${resolveImageSrc(project, thumb)}" 
                alt="${project.title}"
                class="gallery-image"
            >
            <div class="gallery-info">
                <h3 class="gallery-title">${project.title}</h3>
                <div class="gallery-meta">
                    <span class="gallery-category">${project.category}</span>
                    <span>${project.imageCount} images</span>
                </div>
            </div>
        `;

        const imgEl = item.querySelector('.gallery-image');
        attachThumbnailFallback(imgEl, project, candidates);
        
        grid.appendChild(item);

        observeRevealItem(item);
    });
}

function renderFineArtGrid() {
    const grid = document.getElementById('galleryGrid');
    grid.innerHTML = '';

    if (!fineArtProjects.length) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #b0b0b0; padding: 60px 20px;">Gallery is currently empty. Add paintings and drawings from Admin.</p>';
        return;
    }

    fineArtProjects.forEach((project, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item reveal-item';
        item.onclick = () => openModal(fineArtProjects, index);

        const candidates = getThumbnailCandidates(project);
        const thumb = candidates[0] || '';

        item.innerHTML = `
            <img 
                src="${resolveImageSrc(project, thumb)}" 
                alt="${project.title}"
                class="gallery-image"
            >
            <div class="gallery-info">
                <h3 class="gallery-title">${project.title}</h3>
                <div class="gallery-meta">
                    <span class="gallery-category">${project.category}</span>
                    <span>${project.imageCount} images</span>
                </div>
            </div>
        `;

        const imgEl = item.querySelector('.gallery-image');
        attachThumbnailFallback(imgEl, project, candidates);
        grid.appendChild(item);

        observeRevealItem(item);
    });
}

function loadTechArtItems() {
    const publishedSeed = techArtSeed.length ? techArtSeed : DEFAULT_TECH_ART_ITEMS;

    try {
        const raw = localStorage.getItem(TECH_ART_KEY);
        if (!raw) {
            return publishedSeed;
        }

        const parsed = JSON.parse(raw);
        const rawItems = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed.items)
                ? parsed.items
                : (Array.isArray(parsed.entries) ? parsed.entries : []));

        const normalizedItems = normalizeTechArtItems(rawItems);

        const savedOrder = Array.isArray(parsed.itemOrder)
            ? parsed.itemOrder
            : (Array.isArray(parsed.order) ? parsed.order : []);

        const orderedItems = applySavedOrder(normalizedItems, savedOrder);
        const merged = mergeTechArtItems(orderedItems, publishedSeed);
        return merged.length ? merged : publishedSeed;
    } catch (error) {
        return publishedSeed;
    }
}

function renderTechArtGrid() {
    const grid = document.getElementById('techArtGrid');
    if (!grid) {
        return;
    }

    const items = loadTechArtItems();
    grid.innerHTML = '';

    items.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'tech-art-card reveal-item';

        const thumb = (typeof item.thumbnail === 'string' && item.thumbnail.trim())
            ? item.thumbnail.trim()
            : 'https://avatars.githubusercontent.com/u/2232217?s=400&v=4';
        const href = (typeof item.repoUrl === 'string' && item.repoUrl.trim()) ? item.repoUrl.trim() : '#';
        const labelUrl = href.replace(/^https?:\/\//, '');

        card.innerHTML = `
            <div class="tech-art-thumb-wrap">
                <img
                    class="tech-art-thumb"
                    src="${thumb}"
                    alt="${item.title || 'Tech Art'} thumbnail"
                    loading="lazy"
                    decoding="async"
                >
            </div>
            <div class="tech-art-content">
                <h3 class="tech-art-title">${item.title || 'Untitled'}</h3>
                <p class="tech-art-description">${item.description || ''}</p>
                <a class="tech-art-url" href="${href}" target="_blank" rel="noopener noreferrer">${labelUrl}</a>
                <div class="tech-art-actions">
                    <a href="${href}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">View on GitHub</a>
                </div>
            </div>
        `;

        grid.appendChild(card);
        observeRevealItem(card);
    });
}

function initializeMotionAndStats() {
    const revealTargets = [
        ...document.querySelectorAll('.section-title'),
        ...document.querySelectorAll('.portfolio-intro p'),
        ...document.querySelectorAll('.stats'),
        ...document.querySelectorAll('.gallery-controls'),
        ...document.querySelectorAll('.tech-art-card'),
    ];

    revealTargets.forEach((el) => {
        el.classList.add('reveal-item');
        observeRevealItem(el);
    });

    observeStatCounters();
}

function observeRevealItem(element) {
    if (!element) {
        return;
    }

    if (!revealObserver) {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.12,
            rootMargin: '0px 0px -7% 0px',
        });
    }

    revealObserver.observe(element);
}

function observeStatCounters() {
    const statsSection = document.querySelector('.stats');
    if (!statsSection) {
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting || statsAnimated) {
                return;
            }

            statsAnimated = true;
            animateStatCounters();
            observer.disconnect();
        });
    }, {
        threshold: 0.45,
    });

    observer.observe(statsSection);
}

function animateStatCounters() {
    const statEls = document.querySelectorAll('.stat-number');
    statEls.forEach((el) => {
        const originalText = (el.textContent || '').trim();
        const hasPlus = originalText.includes('+');
        const numeric = Number(originalText.replace(/[^\d]/g, ''));

        if (!numeric || Number.isNaN(numeric)) {
            return;
        }

        const duration = 1200;
        const start = performance.now();

        const tick = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = Math.floor(numeric * eased);
            el.textContent = `${value.toLocaleString()}${hasPlus ? '+' : ''}`;

            if (progress < 1) {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    });
}

// ==================== MODAL FUNCTIONS ==================== 
function openModal(projectList, projectIndex) {
    activeModalProjects = Array.isArray(projectList) ? projectList : [];
    currentModalIndex = projectIndex;
    const project = activeModalProjects[projectIndex];
    const modal = document.getElementById('projectModal');

    currentProjectImages = (project.images && project.images.length)
        ? [...project.images]
        : (project.thumbnail ? [project.thumbnail] : []);
    
    // Update modal info
    document.getElementById('modalTitle').textContent = project.title;
    const modalHeaderTitle = document.getElementById('modalHeaderTitle');
    const modalHeaderDescription = document.getElementById('modalHeaderDescription');
    if (modalHeaderTitle) {
        modalHeaderTitle.textContent = project.title;
    }
    if (modalHeaderDescription) {
        modalHeaderDescription.textContent = project.description || 'No description available.';
    }
    const publishLabel = project.publishDate
        ? `Published: ${project.publishDate}`
        : `Year: ${project.year}`;
    document.getElementById('modalYear').textContent = publishLabel;
    document.getElementById('modalCategory').textContent = `Category: ${project.category}`;
    const has3dViewer = Boolean(project.model3dUrl || project.viewerEmbedUrl);
    document.getElementById('modalImages').textContent = `${currentProjectImages.length || 0} Images${has3dViewer ? ' + 3D Viewer' : ''}`;
    document.getElementById('modalDescription').textContent = project.description || 'No description available.';
    const modalBehance = document.getElementById('modalBehanceLink');
    const modalBehanceTop = document.getElementById('modalBehanceTopLink');
    const behanceHref = project.behanceUrl || '#';
    const hasBehanceUrl = Boolean(project.behanceUrl);

    if (modalBehance) {
        modalBehance.href = behanceHref;
        modalBehance.setAttribute('aria-disabled', String(!hasBehanceUrl));
    }

    if (modalBehanceTop) {
        modalBehanceTop.href = behanceHref;
        modalBehanceTop.setAttribute('aria-disabled', String(!hasBehanceUrl));
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    renderProjectRail();

    // Load project images
    loadProjectImages(project);
}

function closeModal() {
    const modal = document.getElementById('projectModal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

async function loadProjectImages(project) {
    const gallery = document.getElementById('modalGallery');
    const viewerWrap = document.getElementById('modal3dViewer');
    gallery.innerHTML = '';
    if (viewerWrap) {
        viewerWrap.innerHTML = '';
        viewerWrap.classList.add('hidden');
    }

    const mediaEntries = buildModalMediaEntries(project);
    if (!mediaEntries.length) {
        gallery.innerHTML = '<p style="color: #b0b0b0; text-align: center; width: 100%;">No images available for this project.</p>';
        return;
    }

    let imageIndex = 0;
    mediaEntries.forEach((entry) => {
        if (entry.type === 'image') {
            const img = document.createElement('img');
            img.src = resolveImageSrc(project, entry.value);
            img.alt = `${project.title} - image ${imageIndex + 1}`;
            // In admin iframe preview, lazy loading can defer nearly all images and look broken.
            img.loading = isAdminEmbeddedPreview ? 'eager' : (imageIndex < 3 ? 'eager' : 'lazy');
            img.decoding = 'async';
            img.onerror = () => {
                img.style.display = 'none';
            };
            gallery.appendChild(img);
            imageIndex += 1;
            return;
        }

        const shell = document.createElement('div');
        shell.className = 'modal-3d-shell';

        if (entry.type === 'embed') {
            const iframe = document.createElement('iframe');
            iframe.src = entry.value;
            iframe.loading = 'lazy';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; xr-spatial-tracking';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            iframe.setAttribute('allowfullscreen', 'true');
            shell.appendChild(iframe);
        } else if (entry.type === 'model3d') {
            const modelViewer = document.createElement('model-viewer');
            modelViewer.setAttribute('src', resolveImageSrc(project, entry.value));
            modelViewer.setAttribute('camera-controls', '');
            modelViewer.setAttribute('auto-rotate', '');
            modelViewer.setAttribute('shadow-intensity', '1');
            modelViewer.setAttribute('touch-action', 'pan-y');
            modelViewer.setAttribute('interaction-prompt', 'auto');
            modelViewer.setAttribute('alt', `${project?.title || 'Project'} 3D model`);
            if (project?.viewerPoster) {
                modelViewer.setAttribute('poster', resolveImageSrc(project, project.viewerPoster));
            }
            shell.appendChild(modelViewer);
        }

        gallery.appendChild(shell);
    });
}

function buildModalMediaEntries(project) {
    const entries = [];
    const embedUrl = sanitizeEmbedUrl(project?.viewerEmbedUrl);
    const modelUrl = String(project?.model3dUrl || '').trim();
    const images = Array.isArray(project?.images) ? project.images.filter(Boolean) : [];

    if (modelUrl) {
        entries.push({ key: 'model3d', type: 'model3d', value: modelUrl });
    }

    if (embedUrl) {
        entries.push({ key: 'embed', type: 'embed', value: embedUrl });
    }

    images.forEach((imagePath) => {
        entries.push({ key: `img:${imagePath}`, type: 'image', value: imagePath });
    });

    return applySavedMediaOrder(entries, project?.mediaOrder);
}

function renderProject3dViewer(project) {
    const viewerWrap = document.getElementById('modal3dViewer');
    if (!viewerWrap) {
        return;
    }

    const embedUrl = sanitizeEmbedUrl(project?.viewerEmbedUrl);
    const modelUrl = String(project?.model3dUrl || '').trim();
    if (!embedUrl && !modelUrl) {
        viewerWrap.classList.add('hidden');
        viewerWrap.innerHTML = '';
        return;
    }

    const shell = document.createElement('div');
    shell.className = 'modal-3d-shell';
    const label = document.createElement('p');
    label.className = 'modal-3d-label';
    label.textContent = 'Embedded Viewer / Video';
    viewerWrap.appendChild(label);

    if (embedUrl) {
        const iframe = document.createElement('iframe');
        iframe.src = embedUrl;
        iframe.loading = 'lazy';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; xr-spatial-tracking';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.setAttribute('allowfullscreen', 'true');
        shell.appendChild(iframe);
    } else if (modelUrl) {
        const modelViewer = document.createElement('model-viewer');
        modelViewer.setAttribute('src', resolveImageSrc(project, modelUrl));
        modelViewer.setAttribute('camera-controls', '');
        modelViewer.setAttribute('auto-rotate', '');
        modelViewer.setAttribute('shadow-intensity', '1');
        modelViewer.setAttribute('touch-action', 'pan-y');
        modelViewer.setAttribute('interaction-prompt', 'auto');
        modelViewer.setAttribute('alt', `${project?.title || 'Project'} 3D model`);
        if (project?.viewerPoster) {
            modelViewer.setAttribute('poster', resolveImageSrc(project, project.viewerPoster));
        }
        shell.appendChild(modelViewer);
    }

    viewerWrap.appendChild(shell);
    viewerWrap.classList.remove('hidden');
}

function sanitizeEmbedUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }

    const iframeSrcMatch = raw.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    const candidate = iframeSrcMatch ? iframeSrcMatch[1].trim() : raw;

    let urlText = candidate;
    if (urlText.startsWith('//')) {
        urlText = `https:${urlText}`;
    }

    let parsed;
    try {
        parsed = new URL(urlText);
    } catch (error) {
        return '';
    }

    if (parsed.protocol !== 'https:') {
        return '';
    }

    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (host.includes('youtu.be')) {
        const id = path.split('/').filter(Boolean)[0] || '';
        return id ? withYoutubeControlsDisabled(`https://www.youtube.com/embed/${id}`) : '';
    }

    if (host.includes('youtube.com')) {
        if (path === '/watch') {
            const id = parsed.searchParams.get('v') || '';
            return id ? withYoutubeControlsDisabled(`https://www.youtube.com/embed/${id}`) : '';
        }
        if (path.startsWith('/shorts/')) {
            const id = path.split('/')[2] || '';
            return id ? withYoutubeControlsDisabled(`https://www.youtube.com/embed/${id}`) : '';
        }
        if (path.startsWith('/embed/')) {
            return withYoutubeControlsDisabled(parsed.toString());
        }
    }

    if (host.includes('sketchfab.com')) {
        if (path.includes('/embed')) {
            return parsed.toString();
        }

        const modelPathMatch = path.match(/^\/models\/([a-zA-Z0-9]+)$/);
        if (modelPathMatch) {
            return `https://sketchfab.com/models/${modelPathMatch[1]}/embed`;
        }

        const modelSlugMatch = path.match(/^\/3d-models\/.*-([a-zA-Z0-9]+)$/);
        if (modelSlugMatch) {
            return `https://sketchfab.com/models/${modelSlugMatch[1]}/embed`;
        }
    }

    if (/^https:\/\//i.test(parsed.toString())) {
        return parsed.toString();
    }

    return '';
}

function withYoutubeControlsDisabled(embedUrl) {
    const raw = String(embedUrl || '').trim();
    if (!raw) {
        return '';
    }

    try {
        const parsed = new URL(raw);
        const host = parsed.hostname.toLowerCase();
        if ((host.includes('youtube.com') || host.includes('youtube-nocookie.com')) && parsed.pathname.startsWith('/embed/')) {
            parsed.searchParams.set('controls', '0');
            return parsed.toString();
        }
        return raw;
    } catch (error) {
        return raw;
    }
}

function nextProject() {
    if (!activeModalProjects.length) {
        return;
    }

    currentModalIndex = (currentModalIndex + 1) % activeModalProjects.length;
    openModal(activeModalProjects, currentModalIndex);
}

function prevProject() {
    if (!activeModalProjects.length) {
        return;
    }

    currentModalIndex = (currentModalIndex - 1 + activeModalProjects.length) % activeModalProjects.length;
    openModal(activeModalProjects, currentModalIndex);
}

function renderProjectRail() {
    const rail = document.getElementById('modalProjectRail');
    if (!rail) {
        return;
    }

    rail.innerHTML = '';

    if (!activeModalProjects.length) {
        return;
    }

    activeModalProjects.forEach((project, index) => {
        const thumbButton = document.createElement('button');
        thumbButton.type = 'button';
        thumbButton.className = `project-thumb${index === currentModalIndex ? ' active' : ''}`;
        thumbButton.setAttribute('role', 'tab');
        thumbButton.setAttribute('aria-selected', String(index === currentModalIndex));
        thumbButton.setAttribute('aria-label', `Open project ${project.title}`);

        const candidates = getThumbnailCandidates(project);
        const preview = candidates[0] || '';

        thumbButton.innerHTML = `
            <img src="${resolveImageSrc(project, preview)}" alt="${project.title}">
            <span class="project-thumb-label">${project.title}</span>
        `;

        const imageEl = thumbButton.querySelector('img');
        attachThumbnailFallback(imageEl, project, candidates);

        thumbButton.addEventListener('click', () => {
            if (index === currentModalIndex) {
                return;
            }

            openModal(activeModalProjects, index);
        });

        rail.appendChild(thumbButton);
    });

    const activeThumb = rail.querySelector('.project-thumb.active');
    if (activeThumb) {
        activeThumb.scrollIntoView({
            behavior: 'smooth',
            inline: 'center',
            block: 'nearest',
        });
    }
}

function buildAssetPath(folder, filename) {
    if (!folder || !filename) {
        return '';
    }

    return `web_images/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;
}

function resolveImageSrc(project, fileName) {
    const value = String(fileName || '').trim();
    if (!value) {
        return '';
    }

    if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
        return value;
    }

    const normalizedValue = value
        .replace(/^\.\//, '')
        .replace(/^(\.\.\/)+/, '');

    if (normalizedValue.startsWith('/')) {
        return normalizedValue.slice(1);
    }

    if (normalizedValue.startsWith('web_images/')) {
        return normalizedValue;
    }

    if (!project || !project.folder) {
        return normalizedValue;
    }

    return buildAssetPath(project.folder, normalizedValue);
}

function getThumbnailCandidates(project) {
    const candidates = [];

    if (project.thumbnail) {
        candidates.push(project.thumbnail);
    }

    if (Array.isArray(project.images)) {
        project.images.forEach((fileName) => {
            if (!candidates.includes(fileName)) {
                candidates.push(fileName);
            }
        });
    }

    return candidates;
}

function attachThumbnailFallback(imgEl, project, candidates) {
    if (!imgEl || !candidates.length) {
        return;
    }

    let idx = 0;
    imgEl.addEventListener('error', () => {
        idx += 1;
        if (idx < candidates.length) {
            imgEl.src = resolveImageSrc(project, candidates[idx]);
            return;
        }

        imgEl.style.backgroundColor = '#2a2a2a';
    });
}

function applyAdminOverrides(baseProjects) {
    const overrides = loadAdminOverrides();
    const removed = new Set(Array.isArray(overrides.removedIds) ? overrides.removedIds : []);
    const added = Array.isArray(overrides.added) ? overrides.added : [];
    const imageOverrides = (overrides.imageOverrides && typeof overrides.imageOverrides === 'object')
        ? overrides.imageOverrides
        : {};
    const projectFieldOverrides = (overrides.projectFieldOverrides && typeof overrides.projectFieldOverrides === 'object')
        ? overrides.projectFieldOverrides
        : {};

    const filteredBase = baseProjects.filter((project) => !removed.has(project.id));
    const cleanedAdded = added
        .filter((project) => project && project.id && project.title)
        .map((project) => applyProjectFieldOverrides(normalizeProjectRecord(project), projectFieldOverrides[project.id]))
        .map((project) => applyImageOverrides(project, imageOverrides[project.id]));

    const cleanedBase = filteredBase
        .map((project) => applyProjectFieldOverrides(normalizeProjectRecord(project), projectFieldOverrides[project.id]))
        .map((project) => applyImageOverrides(project, imageOverrides[project.id]));

    return applySavedOrder([...cleanedAdded, ...cleanedBase], overrides.projectOrder || []);
}

function loadAdminOverrides() {
    try {
        const raw = localStorage.getItem(ADMIN_OVERRIDES_KEY);
        if (!raw) {
            return { added: [], removedIds: [] };
        }

        const parsed = JSON.parse(raw);
        return {
            added: Array.isArray(parsed.added) ? parsed.added : [],
            removedIds: Array.isArray(parsed.removedIds) ? parsed.removedIds : [],
            imageOverrides: parsed.imageOverrides && typeof parsed.imageOverrides === 'object'
                ? parsed.imageOverrides
                : {},
            projectFieldOverrides: parsed.projectFieldOverrides && typeof parsed.projectFieldOverrides === 'object'
                ? parsed.projectFieldOverrides
                : {},
            projectOrder: Array.isArray(parsed.projectOrder) ? parsed.projectOrder : [],
        };
    } catch (error) {
        console.warn('Invalid admin overrides, ignoring.', error);
        return { added: [], removedIds: [], imageOverrides: {}, projectFieldOverrides: {}, projectOrder: [] };
    }
}

function applySavedOrder(items, orderIds) {
    const list = Array.isArray(items) ? [...items] : [];
    const order = Array.isArray(orderIds) ? orderIds : [];
    if (!order.length || !list.length) {
        return list;
    }

    const pool = list.map((item, index) => ({
        item,
        // Preserve entries that are missing ids by giving them a stable fallback key.
        id: item?.id ?? `__index_${index}`,
    }));
    const ordered = [];

    order.forEach((id) => {
        const matchIndex = pool.findIndex((entry) => entry.id === id);
        if (matchIndex >= 0) {
            const [matched] = pool.splice(matchIndex, 1);
            ordered.push(matched.item);
        }
    });

    pool.forEach((entry) => ordered.push(entry.item));
    return ordered;
}

function applySavedMediaOrder(entries, savedOrder) {
    const list = Array.isArray(entries) ? [...entries] : [];
    const order = Array.isArray(savedOrder) ? savedOrder : [];
    if (!list.length || !order.length) {
        return list;
    }

    const byKey = new Map(list.map((entry) => [entry.key, entry]));
    const ordered = [];

    order.forEach((key) => {
        if (byKey.has(key)) {
            ordered.push(byKey.get(key));
            byKey.delete(key);
        }
    });

    byKey.forEach((entry) => ordered.push(entry));
    return ordered;
}

function applyProjectFieldOverrides(project, fieldOverride) {
    if (!project || !fieldOverride || typeof fieldOverride !== 'object') {
        return project;
    }

    return {
        ...project,
        title: fieldOverride.title || project.title,
        description: fieldOverride.description || project.description,
        category: fieldOverride.category || project.category,
        publishDate: fieldOverride.publishDate || project.publishDate,
        year: fieldOverride.year || project.year,
        thumbnail: fieldOverride.thumbnail || project.thumbnail,
        model3dUrl: fieldOverride.model3dUrl || project.model3dUrl || '',
        viewerEmbedUrl: fieldOverride.viewerEmbedUrl || project.viewerEmbedUrl || '',
        viewerPoster: fieldOverride.viewerPoster || project.viewerPoster || '',
    };
}

function loadFineArtGallery(seedGallery) {
    const base = Array.isArray(seedGallery) ? seedGallery : [];
    const overrides = loadAdminOverrides();
    const fieldOverrides = overrides.projectFieldOverrides && typeof overrides.projectFieldOverrides === 'object'
        ? overrides.projectFieldOverrides
        : {};

    try {
        const raw = localStorage.getItem(FINE_ART_GALLERY_KEY);
        if (!raw) {
            return base
                .map((item) => applyProjectFieldOverrides(normalizeGalleryItem(item), fieldOverrides[item.id]));
        }

        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        const hiddenIds = new Set(Array.isArray(parsed.hiddenIds) ? parsed.hiddenIds : []);
        const imageOverrides = parsed.imageOverrides && typeof parsed.imageOverrides === 'object'
            ? parsed.imageOverrides
            : {};
        const itemOrder = Array.isArray(parsed.itemOrder) ? parsed.itemOrder : [];

        const visibleSeed = base
            .filter((item) => !hiddenIds.has(item.id))
            .map((item) => applyProjectFieldOverrides(normalizeGalleryItem(item), fieldOverrides[item.id]))
            .map((item) => applyImageOverrides(item, imageOverrides[item.id]));

        const normalizedItems = items
            .filter((item) => !hiddenIds.has(item.id))
            .map((item) => applyProjectFieldOverrides(normalizeGalleryItem(item), fieldOverrides[item.id]))
            .map((item) => applyImageOverrides(item, imageOverrides[item.id]));

        const mergedItems = [...normalizedItems, ...visibleSeed];
        return applySavedOrder(deduplicateGalleryItems(mergedItems), itemOrder);
    } catch (error) {
        console.warn('Invalid fine-art gallery data. Falling back to seed data.', error);
        return base
            .map((item) => applyProjectFieldOverrides(normalizeGalleryItem(item), fieldOverrides[item.id]));
    }
}

function deduplicateGalleryItems(items) {
    const list = Array.isArray(items) ? items : [];
    const byId = new Set();
    const byContent = new Set();
    const deduped = [];

    list.forEach((item) => {
        if (!item || typeof item !== 'object') {
            return;
        }

        const idKey = String(item.id || '').trim().toLowerCase();
        const titleKey = String(item.title || '').trim().toLowerCase();
        const folderKey = String(item.folder || '').trim().toLowerCase();
        const behanceKey = String(item.behanceUrl || '').trim().toLowerCase();
        const thumbKey = String(item.thumbnail || '').trim().toLowerCase();
        const firstImageKey = String(Array.isArray(item.images) ? (item.images[0] || '') : '').trim().toLowerCase();

        const contentKey = [titleKey, folderKey, behanceKey, thumbKey, firstImageKey].join('|');
        const hasMeaningfulContent = Boolean(titleKey || folderKey || behanceKey || thumbKey || firstImageKey);

        if (idKey && byId.has(idKey)) {
            return;
        }
        if (hasMeaningfulContent && byContent.has(contentKey)) {
            return;
        }

        if (idKey) {
            byId.add(idKey);
        }
        if (hasMeaningfulContent) {
            byContent.add(contentKey);
        }
        deduped.push(item);
    });

    return deduped;
}

function normalizeGalleryItem(item) {
    const images = Array.isArray(item.images) ? item.images.filter(Boolean) : [];
    const thumbnail = item.thumbnail || images[0] || '';
    const imageCount = images.length || (thumbnail ? 1 : 0);

    return {
        id: item.id || `gallery-${Date.now()}`,
        title: item.title || 'Untitled',
        category: item.category || 'Fine Art',
        description: item.description || 'Fine art piece.',
        publishDate: item.publishDate || '',
        year: item.year || (item.publishDate ? String(item.publishDate).slice(0, 4) : ''),
        behanceUrl: item.behanceUrl || '#',
        folder: item.folder || '',
        thumbnail,
        images,
        imageCount,
        mediaOrder: Array.isArray(item.mediaOrder) ? item.mediaOrder : [],
        model3dUrl: item.model3dUrl || '',
        viewerEmbedUrl: item.viewerEmbedUrl || '',
        viewerPoster: item.viewerPoster || '',
    };
}

function normalizeProjectRecord(project) {
    const images = Array.isArray(project.images) ? project.images.filter(Boolean) : [];
    const fallbackThumb = project.thumbnail || images[0] || '';
    const imageCount = project.imageCount || images.length || (fallbackThumb ? 1 : 0);

    return {
        ...project,
        images,
        thumbnail: fallbackThumb,
        imageCount,
        description: project.description || 'No description provided.',
        category: project.category || 'Portfolio',
        year: project.year || (project.publishDate ? String(project.publishDate).slice(0, 4) : ''),
        mediaOrder: Array.isArray(project.mediaOrder) ? project.mediaOrder : [],
        model3dUrl: project.model3dUrl || '',
        viewerEmbedUrl: project.viewerEmbedUrl || '',
        viewerPoster: project.viewerPoster || '',
    };
}

function applyImageOverrides(project, override) {
    if (!override || typeof override !== 'object') {
        return project;
    }

    const hiddenSet = new Set(Array.isArray(override.hidden) ? override.hidden : []);
    const deletedSet = new Set(Array.isArray(override.deleted) ? override.deleted : []);
    const existingImages = Array.isArray(project.images) ? project.images : [];
    const visibleExisting = existingImages.filter((img) => !hiddenSet.has(img) && !deletedSet.has(img));

    const addedImages = Array.isArray(override.added)
        ? override.added.filter((img) => img && !hiddenSet.has(img) && !deletedSet.has(img))
        : [];

    const combined = [...addedImages, ...visibleExisting];
    const deduped = [];
    const seen = new Set();
    combined.forEach((img) => {
        if (!seen.has(img)) {
            seen.add(img);
            deduped.push(img);
        }
    });

    const order = Array.isArray(override.order) ? override.order : [];
    let finalImages = deduped;

    if (order.length) {
        const available = new Set(deduped);
        const ordered = [];

        order.forEach((img) => {
            if (available.has(img) && !ordered.includes(img)) {
                ordered.push(img);
            }
        });

        deduped.forEach((img) => {
            if (!ordered.includes(img)) {
                ordered.push(img);
            }
        });

        finalImages = ordered;
    }

    const overrideThumbnail = typeof override.thumbnail === 'string' ? override.thumbnail.trim() : '';
    const preferredThumbnail = overrideThumbnail || String(project.thumbnail || '').trim();
    const thumbnail = preferredThumbnail || (finalImages[0] || '');
    const mediaOrder = Array.isArray(override.mediaOrder) ? override.mediaOrder : (Array.isArray(project.mediaOrder) ? project.mediaOrder : []);
    return {
        ...project,
        images: finalImages,
        thumbnail,
        imageCount: finalImages.length,
        mediaOrder,
    };
}

function getDefaultSiteContent() {
    return {
        headerBanner: '',
        heroTitle: '',
        heroBio: '',
        heroSubtitle: '',
        landingYoutubePlaylist: [],
        aboutMe: '',
        footerMain: '',
        footerNote: '',
        seoTitle: '',
        seoDescription: '',
        seoKeywords: '',
        canonicalUrl: '',
        ogUrl: '',
        ogTitle: '',
        ogDescription: '',
        ogImage: '',
        twitterTitle: '',
        twitterDescription: '',
        twitterImage: '',
        backToTopEnabled: true,
        customBlocks: [],
    };
}

function loadSiteContent() {
    try {
        const raw = localStorage.getItem(SITE_CONTENT_KEY);
        if (!raw) {
            return getDefaultSiteContent();
        }

        const parsed = JSON.parse(raw);
        return {
            headerBanner: typeof parsed.headerBanner === 'string' ? parsed.headerBanner : '',
            heroTitle: typeof parsed.heroTitle === 'string' ? parsed.heroTitle : '',
            heroBio: typeof parsed.heroBio === 'string' ? parsed.heroBio : '',
            heroSubtitle: typeof parsed.heroSubtitle === 'string' ? parsed.heroSubtitle : '',
            landingYoutubePlaylist: Array.isArray(parsed.landingYoutubePlaylist) ? parsed.landingYoutubePlaylist : [],
            aboutMe: typeof parsed.aboutMe === 'string' ? parsed.aboutMe : '',
            footerMain: typeof parsed.footerMain === 'string' ? parsed.footerMain : '',
            footerNote: typeof parsed.footerNote === 'string' ? parsed.footerNote : '',
            seoTitle: typeof parsed.seoTitle === 'string' ? parsed.seoTitle : '',
            seoDescription: typeof parsed.seoDescription === 'string' ? parsed.seoDescription : '',
            seoKeywords: typeof parsed.seoKeywords === 'string' ? parsed.seoKeywords : '',
            canonicalUrl: typeof parsed.canonicalUrl === 'string' ? parsed.canonicalUrl : '',
            ogUrl: typeof parsed.ogUrl === 'string' ? parsed.ogUrl : '',
            ogTitle: typeof parsed.ogTitle === 'string' ? parsed.ogTitle : '',
            ogDescription: typeof parsed.ogDescription === 'string' ? parsed.ogDescription : '',
            ogImage: typeof parsed.ogImage === 'string' ? parsed.ogImage : '',
            twitterTitle: typeof parsed.twitterTitle === 'string' ? parsed.twitterTitle : '',
            twitterDescription: typeof parsed.twitterDescription === 'string' ? parsed.twitterDescription : '',
            twitterImage: typeof parsed.twitterImage === 'string' ? parsed.twitterImage : '',
            backToTopEnabled: typeof parsed.backToTopEnabled === 'boolean' ? parsed.backToTopEnabled : true,
            customBlocks: Array.isArray(parsed.customBlocks) ? parsed.customBlocks : [],
        };
    } catch (error) {
        return getDefaultSiteContent();
    }
}

function applySiteContent() {
    const content = loadSiteContent();

    const customHeaderBar = document.getElementById('customHeaderBar');
    if (customHeaderBar) {
        const bannerText = (content.headerBanner || '').trim();
        customHeaderBar.textContent = bannerText;
        customHeaderBar.classList.toggle('hidden', !bannerText);
    }

    const heroTitle = document.getElementById('heroTitle');
    if (heroTitle && content.heroTitle) {
        heroTitle.textContent = content.heroTitle;
    }

    const heroBio = document.getElementById('heroBio');
    if (heroBio && content.heroBio) {
        heroBio.textContent = content.heroBio;
    }

    const heroSubtitle = document.getElementById('heroSubtitle');
    if (heroSubtitle && content.heroSubtitle) {
        heroSubtitle.textContent = content.heroSubtitle;
    }

    applyHeroBackgroundVideo(content);

    const footerMain = document.getElementById('footerCopyright');
    if (footerMain && content.footerMain) {
        footerMain.textContent = content.footerMain;
    }

    const footerNote = document.getElementById('footerNote');
    if (footerNote) {
        footerNote.textContent = content.footerNote || footerNote.textContent;
    }

    renderAboutMeContent(content.aboutMe || '');
    renderCustomBlocks(content.customBlocks || []);
    applySeoMeta(content);
    updateBackToTopVisibility(Boolean(content.backToTopEnabled));
}

function applySeoMeta(content) {
    if (content.seoTitle) {
        document.title = content.seoTitle;
    }

    setMetaByName('description', content.seoDescription);
    setMetaByName('keywords', content.seoKeywords);
    setMetaByProperty('og:title', content.ogTitle || content.seoTitle);
    setMetaByProperty('og:description', content.ogDescription || content.seoDescription);
    setMetaByProperty('og:url', content.ogUrl || content.canonicalUrl);
    setMetaByProperty('og:image', content.ogImage);
    setMetaByName('twitter:title', content.twitterTitle || content.ogTitle || content.seoTitle);
    setMetaByName('twitter:description', content.twitterDescription || content.ogDescription || content.seoDescription);
    setMetaByName('twitter:image', content.twitterImage || content.ogImage);

    if (content.canonicalUrl) {
        setCanonicalUrl(content.canonicalUrl);
    }
}

function setMetaByName(name, value) {
    if (!name || !value) {
        return;
    }

    const meta = document.querySelector(`meta[name="${name}"]`);
    if (meta) {
        meta.setAttribute('content', value);
    }
}

function setMetaByProperty(property, value) {
    if (!property || !value) {
        return;
    }

    const meta = document.querySelector(`meta[property="${property}"]`);
    if (meta) {
        meta.setAttribute('content', value);
    }
}

function setCanonicalUrl(url) {
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        canonical.setAttribute('href', url);
    }
}

function renderAboutMeContent(rawText) {
    const aboutMeContent = document.getElementById('aboutMeContent');
    if (!aboutMeContent || !rawText.trim()) {
        return;
    }

    const paragraphs = rawText
        .split(/\n\s*\n/g)
        .map((chunk) => chunk.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    if (!paragraphs.length) {
        return;
    }

    aboutMeContent.innerHTML = '';
    paragraphs.forEach((text) => {
        const p = document.createElement('p');
        p.textContent = text;
        aboutMeContent.appendChild(p);
    });
}

function renderCustomBlocks(blocks) {
    const mounts = {
        home: document.getElementById('homeCustomBlocks'),
        portfolio: document.getElementById('portfolioCustomBlocks'),
        gallery: document.getElementById('galleryCustomBlocks'),
        contact: document.getElementById('contactCustomBlocks'),
    };

    Object.values(mounts).forEach((mount) => {
        if (mount) {
            mount.innerHTML = '';
        }
    });

    (Array.isArray(blocks) ? blocks : []).forEach((block) => {
        const mount = mounts[block.section] || mounts.home;
        if (!mount) {
            return;
        }

        const card = document.createElement('article');
        card.className = 'custom-block reveal-item';

        if (block.title) {
            const heading = document.createElement('h4');
            heading.className = 'custom-block-title';
            heading.textContent = block.title;
            card.appendChild(heading);
        }

        const type = String(block.type || 'text').toLowerCase();
        if (type === 'youtube') {
            const youtubeId = extractYouTubeId(block.content || '');
            if (!youtubeId) {
                return;
            }

            const frameWrap = document.createElement('div');
            frameWrap.className = 'custom-block-video';

            const iframe = document.createElement('iframe');
            iframe.src = `https://www.youtube.com/embed/${youtubeId}?controls=0`;
            iframe.title = block.title || 'YouTube video';
            iframe.loading = 'lazy';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            iframe.allowFullscreen = true;

            frameWrap.appendChild(iframe);
            card.appendChild(frameWrap);
        } else if (type === 'link') {
            const anchor = document.createElement('a');
            anchor.className = 'custom-block-link';
            anchor.href = block.url || '#';
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.textContent = block.content || block.url || 'Open link';
            card.appendChild(anchor);
        } else if (type === 'caption') {
            const caption = document.createElement('p');
            caption.className = 'custom-block-caption';
            caption.textContent = block.content || '';
            card.appendChild(caption);
        } else {
            const text = document.createElement('p');
            text.className = 'custom-block-text';
            text.textContent = block.content || '';
            card.appendChild(text);
        }

        mount.appendChild(card);
        observeRevealItem(card);
    });
}

function extractYouTubeId(input) {
    const text = String(input || '').trim();
    if (!text) {
        return '';
    }

    const directMatch = text.match(/^[a-zA-Z0-9_-]{11}$/);
    if (directMatch) {
        return directMatch[0];
    }

    const watchMatch = text.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
        return watchMatch[1];
    }

    const shortMatch = text.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) {
        return shortMatch[1];
    }

    const embedMatch = text.match(/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) {
        return embedMatch[1];
    }

    return '';
}

function normalizeLandingYoutubePlaylist(rawList) {
    const list = Array.isArray(rawList) ? rawList : [];
    const dedupedIds = new Set();
    const normalized = [];

    list.forEach((entry) => {
        const id = extractYouTubeId(entry);
        if (!id || dedupedIds.has(id)) {
            return;
        }

        dedupedIds.add(id);
        normalized.push(`https://www.youtube.com/watch?v=${id}`);
    });

    return normalized;
}

function getLandingYoutubePlaylist(content) {
    const configured = normalizeLandingYoutubePlaylist(content?.landingYoutubePlaylist || []);
    if (configured.length) {
        return configured;
    }

    return normalizeLandingYoutubePlaylist(landingYoutubeSeed);
}

function buildHeroYoutubeEmbedUrl(videoId) {
    const id = String(videoId || '').trim();
    if (!id) {
        return '';
    }

    const params = new URLSearchParams({
        autoplay: '1',
        mute: '1',
        controls: '0',
        disablekb: '1',
        fs: '0',
        rel: '0',
        playsinline: '1',
        loop: '1',
        playlist: id,
        modestbranding: '1',
        iv_load_policy: '3',
        enablejsapi: '1',
    });

    if (/^https?:/i.test(window.location.protocol) && window.location.origin) {
        params.set('origin', window.location.origin);
    }

    return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

function nudgeHeroYoutubePlayback(videoFrame) {
    if (!videoFrame || !videoFrame.contentWindow) {
        return;
    }

    const payload = JSON.stringify({
        event: 'command',
        func: 'playVideo',
        args: [],
    });

    const sendPlay = () => {
        if (!videoFrame.contentWindow) {
            return;
        }
        videoFrame.contentWindow.postMessage(payload, '*');
    };

    // Send multiple play commands through early startup to avoid initial paused state.
    sendPlay();
    setTimeout(sendPlay, 220);
    setTimeout(sendPlay, 650);
}

function parseYoutubeMessagePayload(rawPayload) {
    if (!rawPayload) {
        return null;
    }

    if (typeof rawPayload === 'string') {
        try {
            return JSON.parse(rawPayload);
        } catch (error) {
            return null;
        }
    }

    if (typeof rawPayload === 'object') {
        return rawPayload;
    }

    return null;
}

function attachHeroYoutubeStateListener() {
    if (heroYoutubeStateListenerAttached) {
        return;
    }

    window.addEventListener('message', (event) => {
        const origin = String(event.origin || '').toLowerCase();
        if (!origin.includes('youtube.com') && !origin.includes('youtube-nocookie.com')) {
            return;
        }

        if (!activeHeroVideoFrame || event.source !== activeHeroVideoFrame.contentWindow) {
            return;
        }

        const payload = parseYoutubeMessagePayload(event.data);
        if (!payload || payload.event !== 'onStateChange') {
            return;
        }

        // YT PlayerState.PLAYING = 1
        if (Number(payload.info) === 1 && activeHeroVideoMount) {
            activeHeroVideoMount.classList.add('is-visible');
            activeHeroVideoMount.classList.add('is-playing');
        }
    });

    heroYoutubeStateListenerAttached = true;
}

function subscribeToHeroYoutubeState(videoFrame) {
    if (!videoFrame || !videoFrame.contentWindow) {
        return;
    }

    const subscribePayload = JSON.stringify({
        event: 'command',
        func: 'addEventListener',
        args: ['onStateChange'],
    });

    const sendSubscribe = () => {
        if (!videoFrame.contentWindow) {
            return;
        }
        videoFrame.contentWindow.postMessage(subscribePayload, '*');
    };

    sendSubscribe();
    setTimeout(sendSubscribe, 180);
    setTimeout(sendSubscribe, 520);
}

function applyHeroBackgroundVideo(content) {
    const videoMount = document.getElementById('heroVideoBackground');
    const videoFrame = document.getElementById('heroYoutubeFrame');
    if (!videoMount || !videoFrame) {
        return;
    }

    if (heroVideoRevealTimer) {
        clearTimeout(heroVideoRevealTimer);
        heroVideoRevealTimer = null;
    }
    attachHeroYoutubeStateListener();
    activeHeroVideoFrame = videoFrame;
    activeHeroVideoMount = videoMount;
    videoMount.classList.remove('is-visible');
    videoMount.classList.remove('is-playing');

    const playlist = getLandingYoutubePlaylist(content);
    if (!playlist.length) {
        videoMount.classList.add('hidden');
        videoFrame.src = '';
        return;
    }

    const randomIndex = Math.floor(Math.random() * playlist.length);
    const randomVideo = playlist[randomIndex];
    const videoId = extractYouTubeId(randomVideo);
    if (!videoId) {
        videoMount.classList.add('hidden');
        videoFrame.src = '';
        return;
    }

    const embedUrl = buildHeroYoutubeEmbedUrl(videoId);
    if (!embedUrl) {
        videoMount.classList.add('hidden');
        videoFrame.src = '';
        return;
    }

    videoFrame.addEventListener('load', () => {
        subscribeToHeroYoutubeState(videoFrame);
        nudgeHeroYoutubePlayback(videoFrame);
        heroVideoRevealTimer = setTimeout(() => {
            // Fallback: release startup mask even if YouTube state events are blocked.
            videoMount.classList.add('is-visible');
            videoMount.classList.add('is-playing');
            heroVideoRevealTimer = null;
        }, 1400);
    }, { once: true });

    videoFrame.src = embedUrl;
    videoMount.classList.remove('hidden');
}

function setupBackToTopButton() {
    const backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn) {
        return;
    }

    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', () => {
        if (backToTopBtn.dataset.enabled !== '1') {
            backToTopBtn.classList.add('hidden');
            return;
        }

        const show = window.scrollY > 480;
        backToTopBtn.classList.toggle('hidden', !show);
    });
}

function updateBackToTopVisibility(enabled) {
    const backToTopBtn = document.getElementById('backToTopBtn');
    if (!backToTopBtn) {
        return;
    }

    backToTopBtn.dataset.enabled = enabled ? '1' : '0';
    if (!enabled) {
        backToTopBtn.classList.add('hidden');
    }
}

// ==================== EVENT LISTENERS ==================== 
function setupEventListeners() {
    // Category filter
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
        filterByCategory(e.target.value);
    });
    
    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchProjects(e.target.value);
    });
    
    // Modal controls
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    const prevButton = document.querySelector('.modal-prev');
    const nextButton = document.querySelector('.modal-next');
    if (prevButton) {
        prevButton.addEventListener('click', prevProject);
    }
    if (nextButton) {
        nextButton.addEventListener('click', nextProject);
    }

    const thumbPrevButton = document.querySelector('.thumb-scroll-prev');
    const thumbNextButton = document.querySelector('.thumb-scroll-next');

    if (thumbPrevButton) {
        thumbPrevButton.addEventListener('click', prevProject);
    }
    if (thumbNextButton) {
        thumbNextButton.addEventListener('click', nextProject);
    }
    
    // Close modal on overlay click
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    
    // Prevent closing when clicking on modal content
    document.querySelector('.modal-wrapper').addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Navigation links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('projectModal');
        if (modal.classList.contains('active')) {
            if (e.key === 'ArrowLeft') prevProject();
            if (e.key === 'ArrowRight') nextProject();
            if (e.key === 'Escape') closeModal();
        }
    });

    window.addEventListener('storage', async (event) => {
        if (event.key !== ADMIN_OVERRIDES_KEY
            && event.key !== FINE_ART_GALLERY_KEY
            && event.key !== TECH_ART_KEY
            && event.key !== SITE_CONTENT_KEY) {
            return;
        }

        await reloadProjectsFromLocalState();
    });

    // Listen for real-time sync messages from Admin
    syncChannel.addEventListener('message', async (event) => {
        if (event.data.type === 'overrides-changed'
            || event.data.type === 'gallery-changed'
            || event.data.type === 'tech-art-changed'
            || event.data.type === 'site-content-changed') {
            await reloadProjectsFromLocalState();
        }
    });
}

async function reloadProjectsFromLocalState() {
    await loadProjects();
    applySiteContent();
    populateCategoryFilter();

    const categoryValue = document.getElementById('categoryFilter').value;
    const searchValue = document.getElementById('searchInput').value.trim();

    if (searchValue) {
        searchProjects(searchValue);
    } else if (categoryValue) {
        filterByCategory(categoryValue);
    } else {
        filteredProjects = [...portfolioProjects];
        renderPortfolioGrid();
    }

    renderFineArtGrid();
    renderTechArtGrid();
}

// ==================== NAVIGATION HIGHLIGHTING ==================== 
function updateNavigation() {
    window.addEventListener('scroll', () => {
        const sections = document.querySelectorAll('section[id]');
        let currentSection = 'home';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            
            if (window.scrollY >= sectionTop - 200) {
                currentSection = section.getAttribute('id');
            }
        });
        
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSection}`) {
                link.classList.add('active');
            }
        });
    });
}

// ==================== UTILITY: Count images in project ==================== 
function getImageCount(projectFolder) {
    // This would need backend support to actually count
    // For now, return a placeholder
    return Math.floor(Math.random() * 100) + 20;
}

