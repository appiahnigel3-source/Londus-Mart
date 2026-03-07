
const SUPABASE_URL = "https://dwjkusopxpnrmrphdjwh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3amt1c29weHBucm1ycGhkandoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDE3MjIsImV4cCI6MjA4ODM3NzcyMn0.O1cExLNIo1BjSYzJA6CA34GDzCqEB9sMtZf3onZpkMQ"; // ← REPLACE THIS!

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// FETCH PRODUCTS FROM SUPABASE
// ============================================

async function fetchProducts(filters = {}) {
    let query = db.from('products').select('*').eq('in_stock', true);

    if (filters.category) {
        // Support both category match AND uk-imports/us-imports parent
        if (filters.category === 'uk-imports' || filters.category === 'us-imports') {
            query = db.from('products').select('*').eq('in_stock', true)
                .or(`category.eq.${filters.category},category.eq.beverages,category.eq.snacks,category.eq.household`)
                .eq('origin', filters.category === 'uk-imports' ? 'UK' : 'USA');
        } else {
            query = db.from('products').select('*').eq('in_stock', true).eq('category', filters.category);
        }
    }

    if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`);
    }

    if (filters.minPrice) query = query.gte('price', filters.minPrice);
    if (filters.maxPrice) query = query.lte('price', filters.maxPrice);

    if (filters.sort === 'price-low') query = query.order('price', { ascending: true });
    else if (filters.sort === 'price-high') query = query.order('price', { ascending: false });
    else if (filters.sort === 'name') query = query.order('name', { ascending: true });
    else query = query.order('created_at', { ascending: false });

    const { data, error } = await query;
    if (error) { console.error('Error fetching products:', error); return []; }
    return data || [];
}

async function fetchFeaturedProducts() {
    const { data, error } = await db
        .from('products')
        .select('*')
        .eq('in_stock', true)
        .eq('featured', true)
        .limit(8);
    if (error) { console.error('Error:', error); return []; }
    return data || [];
}

async function fetchProductById(id) {
    const { data, error } = await db
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
    if (error) { console.error('Error:', error); return null; }
    return data;
}

// ============================================
// SAVE ORDERS TO SUPABASE
// ============================================

async function saveOrder(orderData) {
    const { data, error } = await db
        .from('orders')
        .insert([orderData]);
    if (error) { console.error('Order error:', error); return false; }
    return true;
}

// ============================================
// SAVE WHOLESALE APPLICATION TO SUPABASE
// ============================================

async function saveWholesaleApplication(appData) {
    const { data, error } = await db
        .from('wholesale_applications')
        .insert([appData]);
    if (error) { console.error('Wholesale error:', error); return false; }
    return true;
}

// ============================================
// PRODUCT CARD RENDERER
// ============================================

function buildProductCard(product) {
    const imageUrl = product.image_url || product.image || 
        `https://via.placeholder.com/300x300/1E3A8A/FFFFFF?text=${encodeURIComponent(product.name)}`;
    
    const price = parseFloat(product.price).toFixed(2);
    const wholesalePrice = product.wholesale_price ? parseFloat(product.wholesale_price).toFixed(2) : null;
    const hasDiscount = product.discount && product.discount > 0;
    const discountedPrice = hasDiscount 
        ? (product.price * (1 - product.discount / 100)).toFixed(2) 
        : null;

    const originFlag = product.origin === 'UK' ? '🇬🇧' : product.origin === 'USA' ? '🇺🇸' : '🇬🇭';

    return `
        <div class="product-card" data-id="${product.id}" data-category="${product.category}">
            ${hasDiscount ? `<div class="product-badge sale">-${product.discount}%</div>` : ''}
            <div class="product-image" onclick="viewProduct(${product.id})">
                <img 
                    src="${imageUrl}" 
                    alt="${product.name}"
                    onerror="this.src='https://via.placeholder.com/300x300/1E3A8A/FFFFFF?text=${encodeURIComponent(product.name)}'"
                    loading="lazy"
                >
                <div class="product-overlay">
                    <button class="overlay-btn" onclick="event.stopPropagation(); addToCart(${product.id})">
                        <i class="fas fa-shopping-cart"></i> Add to Cart
                    </button>
                </div>
            </div>
            <div class="product-info">
                <div class="product-origin">${originFlag} ${product.origin || ''}</div>
                <h3 class="product-name" onclick="viewProduct(${product.id})">${product.name}</h3>
                <p class="product-description">${product.description || ''}</p>
                <div class="product-price-row">
                    <div class="product-prices">
                        ${hasDiscount 
                            ? `<span class="product-price">GHS ${discountedPrice}</span>
                               <span class="product-original-price">GHS ${price}</span>`
                            : `<span class="product-price">GHS ${price}</span>`
                        }
                        ${wholesalePrice ? `<span class="product-wholesale-price">Wholesale: GHS ${wholesalePrice}</span>` : ''}
                    </div>
                    <button class="product-add-btn" onclick="addToCart(${product.id})">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// PAGE: HOME — Featured Products
// ============================================

async function initHomePage() {
    const grid = document.querySelector('.products .products-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner">Loading products...</div>';
    const products = await fetchFeaturedProducts();

    if (products.length === 0) {
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">No featured products yet. Add some in Supabase!</p>';
        return;
    }
    grid.innerHTML = products.map(buildProductCard).join('');
}

// ============================================
// PAGE: SHOP — All Products with Filters
// ============================================

let currentFilters = {};

async function initShopPage() {
    await renderShopProducts();
}

async function renderShopProducts() {
    const grid = document.querySelector('.shop-main .products-grid');
    const countEl = document.querySelector('.products-count');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner">Loading products...</div>';
    const products = await fetchProducts(currentFilters);

    if (countEl) countEl.textContent = `${products.length} product${products.length !== 1 ? 's' : ''} found`;

    if (products.length === 0) {
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">No products found. Try a different filter.</p>';
        return;
    }
    grid.innerHTML = products.map(buildProductCard).join('');
}

async function filterProducts() {
    const searchInput = document.getElementById('search-input');
    const minPrice = document.getElementById('price-min');
    const maxPrice = document.getElementById('price-max');
    const checkedCategories = [...document.querySelectorAll('.shop-sidebar input[type="checkbox"]:checked')]
        .map(cb => cb.value).filter(v => v && v !== 'on');

    currentFilters = {
        search: searchInput?.value || '',
        minPrice: minPrice?.value || null,
        maxPrice: maxPrice?.value || null,
        category: checkedCategories.length === 1 ? checkedCategories[0] : null,
        sort: document.querySelector('.sort-select')?.value || 'default'
    };

    await renderShopProducts();
}

async function sortProducts(value) {
    currentFilters.sort = value;
    await renderShopProducts();
}

// ============================================
// PAGE: PRODUCT DETAILS
// ============================================

async function initProductPage() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');
    if (!productId) { window.location.href = 'shop.html'; return; }

    const product = await fetchProductById(productId);
    if (!product) { window.location.href = 'shop.html'; return; }

    const imageUrl = product.image_url || product.image ||
        `https://via.placeholder.com/600x600/1E3A8A/FFFFFF?text=${encodeURIComponent(product.name)}`;

    // Update main image
    const mainImg = document.querySelector('.main-image img');
    if (mainImg) { mainImg.src = imageUrl; mainImg.alt = product.name; }

    // Update page title
    document.title = `${product.name} - Londus Mart`;

    const infoContainer = document.querySelector('.product-details-info');
    if (!infoContainer) return;

    const originFlag = product.origin === 'UK' ? '🇬🇧' : product.origin === 'USA' ? '🇺🇸' : '🇬🇭';
    const hasDiscount = product.discount && product.discount > 0;
    const discountedPrice = hasDiscount 
        ? (product.price * (1 - product.discount / 100)).toFixed(2) 
        : parseFloat(product.price).toFixed(2);

    infoContainer.innerHTML = `
        <div class="product-origin-tag">${originFlag} ${product.origin || ''} Import</div>
        <h1>${product.name}</h1>
        <div class="product-price-details">
            <div>
                <span class="product-price" style="font-size:32px;color:#E63946;">GHS ${discountedPrice}</span>
                ${hasDiscount ? `<span class="product-original-price" style="font-size:18px;text-decoration:line-through;color:#999;margin-left:10px;">GHS ${parseFloat(product.price).toFixed(2)}</span>` : ''}
            </div>
            ${product.wholesale_price ? `<div style="color:#1E3A8A;font-size:16px;">Wholesale: GHS ${parseFloat(product.wholesale_price).toFixed(2)}</div>` : ''}
        </div>
        <p style="color:#64748B;margin:20px 0;line-height:1.8;">${product.description || 'No description available.'}</p>
        <div class="product-stock" style="margin:15px 0;">
            <span style="color:${product.in_stock ? '#10B981' : '#EF4444'};">
                ${product.in_stock ? '✓ In Stock' : '✗ Out of Stock'}
            </span>
        </div>
        <div class="quantity-selector" style="display:flex;align-items:center;gap:15px;margin:20px 0;">
            <button onclick="updateQuantity(-1)" class="btn btn-outline" style="padding:10px 18px;">−</button>
            <span id="qty-display" style="font-size:20px;font-weight:bold;">1</span>
            <button onclick="updateQuantity(1)" class="btn btn-outline" style="padding:10px 18px;">+</button>
        </div>
        <div style="display:flex;gap:15px;flex-wrap:wrap;margin-top:20px;">
            <button class="btn btn-primary" onclick="addToCartFromDetails(${product.id})">
                <i class="fas fa-shopping-cart"></i> Add to Cart
            </button>
            <a href="shop.html" class="btn btn-outline">← Back to Shop</a>
        </div>
    `;

    // Load related products
    const relatedGrid = document.querySelector('.products .products-grid');
    if (relatedGrid && product.category) {
        const related = await fetchProducts({ category: product.category });
        const others = related.filter(p => p.id != productId).slice(0, 4);
        relatedGrid.innerHTML = others.length > 0 
            ? others.map(buildProductCard).join('') 
            : '<p style="text-align:center;padding:20px;color:#666;">No related products found.</p>';
    }
}

// ============================================
// CART FUNCTIONS (use localStorage + Supabase on checkout)
// ============================================

function addToCart(productId) {
    // productId here is from Supabase (could be int or string)
    let cart = JSON.parse(localStorage.getItem('londusCart')) || [];
    const existing = cart.find(i => i.id == productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id: productId, quantity: 1 });
    }
    localStorage.setItem('londusCart', JSON.stringify(cart));
    updateCartBadge();
    showToast('Added to cart!', 'success');
}

function addToCartFromDetails(productId) {
    const qty = parseInt(document.getElementById('qty-display')?.textContent) || 1;
    let cart = JSON.parse(localStorage.getItem('londusCart')) || [];
    const existing = cart.find(i => i.id == productId);
    if (existing) {
        existing.quantity += qty;
    } else {
        cart.push({ id: productId, quantity: qty });
    }
    localStorage.setItem('londusCart', JSON.stringify(cart));
    updateCartBadge();
    showToast(`${qty} item(s) added to cart!`, 'success');
}

function updateQuantity(change) {
    const display = document.getElementById('qty-display');
    if (!display) return;
    let qty = parseInt(display.textContent) + change;
    if (qty < 1) qty = 1;
    display.textContent = qty;
}

function updateCartBadge() {
    const cart = JSON.parse(localStorage.getItem('londusCart')) || [];
    const total = cart.reduce((sum, i) => sum + i.quantity, 0);
    document.querySelectorAll('.cart-badge').forEach(b => {
        b.textContent = total;
        b.style.display = total > 0 ? 'flex' : 'none';
    });
}

// ============================================
// PAGE: CART — Render with live Supabase prices
// ============================================

async function renderCart() {
    const container = document.querySelector('.cart-items-container');
    const subtotalEl = document.querySelector('.summary-subtotal');
    const totalEl = document.querySelector('.total-amount');
    if (!container) return;

    let cart = JSON.parse(localStorage.getItem('londusCart')) || [];

    if (cart.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px;">
                <div style="font-size:60px;margin-bottom:20px;">🛒</div>
                <h2 style="color:#1E3A8A;margin-bottom:15px;">Your cart is empty</h2>
                <a href="shop.html" class="btn btn-primary">Start Shopping</a>
            </div>`;
        return;
    }

    container.innerHTML = '<div class="loading-spinner">Loading cart...</div>';

    // Fetch all product details for cart items
    const productPromises = cart.map(item => fetchProductById(item.id));
    const productDetails = await Promise.all(productPromises);

    let subtotal = 0;
    let html = `
        <div class="cart-header" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;padding:15px;background:#f8fafc;font-weight:600;border-radius:8px;margin-bottom:10px;">
            <span>Product</span><span>Price</span><span>Quantity</span><span>Total</span>
        </div>`;

    cart.forEach((item, index) => {
        const product = productDetails[index];
        if (!product) return;

        const price = parseFloat(product.price);
        const lineTotal = price * item.quantity;
        subtotal += lineTotal;

        const imageUrl = product.image_url || product.image ||
            `https://via.placeholder.com/80x80/1E3A8A/FFFFFF?text=${encodeURIComponent(product.name)}`;

        html += `
            <div class="cart-item" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;align-items:center;padding:20px 15px;border-bottom:1px solid #f1f5f9;gap:15px;">
                <div style="display:flex;align-items:center;gap:15px;">
                    <img src="${imageUrl}" alt="${product.name}" 
                         onerror="this.src='https://via.placeholder.com/80x80/1E3A8A/FFFFFF?text=Img'"
                         style="width:70px;height:70px;object-fit:cover;border-radius:8px;">
                    <div>
                        <h4 style="color:#1E3A8A;">${product.name}</h4>
                        <button onclick="removeFromCart(${product.id})" style="background:none;border:none;color:#E63946;cursor:pointer;font-size:13px;margin-top:5px;">
                            <i class="fas fa-trash"></i> Remove
                        </button>
                    </div>
                </div>
                <span style="color:#E63946;font-weight:600;">GHS ${price.toFixed(2)}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button onclick="updateCartQuantity(${product.id}, -1)" style="width:28px;height:28px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">−</button>
                    <span style="font-weight:bold;">${item.quantity}</span>
                    <button onclick="updateCartQuantity(${product.id}, 1)" style="width:28px;height:28px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;">+</button>
                </div>
                <span style="font-weight:600;">GHS ${lineTotal.toFixed(2)}</span>
            </div>`;
    });

    container.innerHTML = html;

    if (subtotalEl) subtotalEl.textContent = `GHS ${subtotal.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `GHS ${subtotal.toFixed(2)}`;
}

function removeFromCart(productId) {
    let cart = JSON.parse(localStorage.getItem('londusCart')) || [];
    cart = cart.filter(i => i.id != productId);
    localStorage.setItem('londusCart', JSON.stringify(cart));
    updateCartBadge();
    renderCart();
    showToast('Item removed from cart', 'success');
}

function updateCartQuantity(productId, change) {
    let cart = JSON.parse(localStorage.getItem('londusCart')) || [];
    const item = cart.find(i => i.id == productId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            cart = cart.filter(i => i.id != productId);
        }
    }
    localStorage.setItem('londusCart', JSON.stringify(cart));
    updateCartBadge();
    renderCart();
}

// ============================================
// CHECKOUT — Save order to Supabase
// ============================================

async function handleCheckout(event) {
    event.preventDefault();
    const cart = JSON.parse(localStorage.getItem('londusCart')) || [];
    if (cart.length === 0) { showToast('Your cart is empty!', 'error'); return; }

    const location = document.getElementById('delivery-location')?.value;
    const address = document.querySelector('.checkout-form input[type="text"]')?.value;
    const phone = document.querySelector('.checkout-form input[type="tel"]')?.value;
    const payment = document.querySelector('input[name="payment"]:checked')?.value;

    const subtotalEl = document.querySelector('.summary-subtotal');
    const total = subtotalEl ? parseFloat(subtotalEl.textContent.replace('GHS ', '')) : 0;

    const orderData = {
        items: cart,
        total: total,
        delivery_location: location,
        delivery_address: address,
        phone: phone,
        payment_method: payment,
        status: 'pending'
    };

    const btn = document.querySelector('.btn-checkout');
    if (btn) { btn.textContent = 'Placing Order...'; btn.disabled = true; }

    const success = await saveOrder(orderData);

    if (success) {
        localStorage.removeItem('londusCart');
        updateCartBadge();
        showToast('Order placed successfully! We will contact you shortly.', 'success');
        setTimeout(() => window.location.href = 'index.html', 2500);
    } else {
        showToast('Something went wrong. Please try again.', 'error');
        if (btn) { btn.textContent = 'Proceed to Checkout'; btn.disabled = false; }
    }
}

// ============================================
// WHOLESALE — Save to Supabase
// ============================================

async function handleWholesaleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const btn = form.querySelector('.form-submit');

    const appData = {
        business_name: form.querySelector('[name="business-name"]')?.value,
        phone: form.querySelector('[name="phone"]')?.value,
        email: form.querySelector('[name="email"]')?.value,
        location: form.querySelector('[name="location"]')?.value,
        business_type: form.querySelector('[name="business-type"]')?.value,
        description: form.querySelector('[name="description"]')?.value,
        status: 'pending'
    };

    if (btn) { btn.textContent = 'Submitting...'; btn.disabled = true; }

    const success = await saveWholesaleApplication(appData);

    if (success) {
        showToast('Application submitted! We will contact you within 48 hours.', 'success');
        form.reset();
    } else {
        showToast('Submission failed. Please try again.', 'error');
    }

    if (btn) { btn.textContent = 'Submit Application'; btn.disabled = false; }
}

// ============================================
// SHARED UTILITIES
// ============================================

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : '⚠'}</span>
        <span class="toast-message">${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function viewProduct(id) {
    window.location.href = `product.html?id=${id}`;
}

function toggleMobileMenu() {
    const navMenu = document.querySelector('.nav-menu');
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    if (navMenu && mobileBtn) {
        navMenu.classList.toggle('active');
        mobileBtn.classList.toggle('active');
    }
}

function toggleSearch() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.focus();
    else showToast('Use the search bar in the Shop page!', 'success');
}

// ============================================
// INITIALIZE — Run correct code per page
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();

    const page = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

    switch (page) {
        case '':
        case 'index':
            initHomePage();
            break;
        case 'shop':
            // Check URL for category filter
            const params = new URLSearchParams(window.location.search);
            const cat = params.get('category');
            if (cat) currentFilters.category = cat;
            initShopPage();
            break;
        case 'product':
            initProductPage();
            break;
        case 'cart':
            renderCart();
            break;
    }
});

// Expose functions globally
window.addToCart = addToCart;
window.addToCartFromDetails = addToCartFromDetails;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.updateQuantity = updateQuantity;
window.viewProduct = viewProduct;
window.filterProducts = filterProducts;
window.sortProducts = sortProducts;
window.handleCheckout = handleCheckout;
window.handleWholesaleSubmit = handleWholesaleSubmit;
window.toggleMobileMenu = toggleMobileMenu;
window.toggleSearch = toggleSearch;
