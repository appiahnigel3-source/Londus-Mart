/* ============================================
   LONDUS MART - Supabase Integration
   ============================================ */

const SUPABASE_URL = "https://dwjkusopxpnrmrphdjwh.supabase.co";
const SUPABASE_KEY = "YOUR_ANON_PUBLIC_KEY"; // ← REPLACE WITH YOUR REAL KEY

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Make db globally available for admin.html
window.db = db;

// ============================================
// FETCH PRODUCTS FROM SUPABASE
// ============================================

async function fetchProducts(filters = {}) {
    let query = db.from('products').select('*').eq('in_stock', true);

    if (filters.category) {
        if (filters.category === 'uk-imports' || filters.category === 'us-imports') {
            query = db.from('products').select('*').eq('in_stock', true)
                .eq('origin', filters.category === 'uk-imports' ? 'UK' : 'USA');
        } else {
            query = db.from('products').select('*').eq('in_stock', true).eq('category', filters.category);
        }
    }

    if (filters.search) query = query.ilike('name', `%${filters.search}%`);
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
    // If no featured products, just get latest 8
    let { data, error } = await db.from('products').select('*').eq('in_stock', true).eq('featured', true).limit(8);
    if (error || !data || data.length === 0) {
        const res = await db.from('products').select('*').eq('in_stock', true).limit(8);
        return res.data || [];
    }
    return data;
}

async function fetchProductById(id) {
    const { data, error } = await db.from('products').select('*').eq('id', id).single();
    if (error) { console.error('Error:', error); return null; }
    return data;
}

// ============================================
// SAVE ORDERS TO SUPABASE
// ============================================

async function saveOrder(orderData) {
    const { error } = await db.from('orders').insert([orderData]);
    if (error) { console.error('Order error:', error); return false; }
    return true;
}

// ============================================
// SAVE WHOLESALE APPLICATION TO SUPABASE
// ============================================

async function saveWholesaleApplication(appData) {
    const { error } = await db.from('wholesale_applications').insert([appData]);
    if (error) { console.error('Wholesale error:', error); return false; }
    return true;
}

// ============================================
// PRODUCT CARD RENDERER — Mobile Friendly
// ============================================

function buildProductCard(product) {
    const imageUrl = product.image_url || product.image ||
        `https://placehold.co/300x300/1E3A8A/FFFFFF?text=${encodeURIComponent(product.name)}`;

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
            <div class="product-image" onclick="viewProduct(${product.id})" style="position:relative;overflow:hidden;aspect-ratio:1/1;">
                <img
                    src="${imageUrl}"
                    alt="${product.name}"
                    onerror="this.src='https://placehold.co/300x300/1E3A8A/FFFFFF?text=${encodeURIComponent(product.name)}'"
                    loading="lazy"
                    style="width:100%;height:100%;object-fit:cover;display:block;"
                >
                <div class="product-overlay">
                    <button class="overlay-btn" onclick="event.stopPropagation(); addToCart(${product.id})">
                        <i class="fas fa-shopping-cart"></i> Add to Cart
                    </button>
                </div>
            </div>
            <div class="product-info" style="padding:12px;">
                <div class="product-origin" style="font-size:12px;color:#64748B;margin-bottom:4px;">${originFlag} ${product.origin || ''}</div>
                <h3 class="product-name" onclick="viewProduct(${product.id})" style="font-size:14px;font-weight:600;margin-bottom:4px;cursor:pointer;color:#1E3A8A;">${product.name}</h3>
                <p class="product-description" style="font-size:12px;color:#64748B;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${product.description || ''}</p>
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;">
                    <div>
                        ${hasDiscount
                            ? `<span style="font-size:16px;font-weight:700;color:#E63946;">GHS ${discountedPrice}</span>
                               <span style="font-size:12px;text-decoration:line-through;color:#999;margin-left:4px;">GHS ${price}</span>`
                            : `<span style="font-size:16px;font-weight:700;color:#E63946;">GHS ${price}</span>`
                        }
                        ${wholesalePrice ? `<div style="font-size:11px;color:#1E3A8A;font-weight:500;">Wholesale: GHS ${wholesalePrice}</div>` : ''}
                    </div>
                    <button onclick="addToCart(${product.id})" style="background:#E63946;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px;white-space:nowrap;">
                        <i class="fas fa-plus"></i> Add
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

    grid.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">Loading products...</div>';
    const products = await fetchFeaturedProducts();

    if (products.length === 0) {
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">No products yet. Add some in Supabase!</p>';
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

    grid.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">Loading products...</div>';
    const products = await fetchProducts(currentFilters);

    if (countEl) countEl.textContent = `${products.length} product${products.length !== 1 ? 's' : ''} found`;

    if (products.length === 0) {
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">No products found.</p>';
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
        `https://placehold.co/600x600/1E3A8A/FFFFFF?text=${encodeURIComponent(product.name)}`;

    const mainImg = document.querySelector('.main-image img');
    if (mainImg) { mainImg.src = imageUrl; mainImg.alt = product.name; }

    document.title = `${product.name} - Londus Mart`;

    const infoContainer = document.querySelector('.product-details-info');
    if (!infoContainer) return;

    const originFlag = product.origin === 'UK' ? '🇬🇧' : product.origin === 'USA' ? '🇺🇸' : '🇬🇭';
    const hasDiscount = product.discount && product.discount > 0;
    const discountedPrice = hasDiscount
        ? (product.price * (1 - product.discount / 100)).toFixed(2)
        : parseFloat(product.price).toFixed(2);

    infoContainer.innerHTML = `
        <div style="font-size:13px;color:#64748B;margin-bottom:8px;">${originFlag} ${product.origin || ''} Import</div>
        <h1 style="font-size:28px;color:#1E3A8A;margin-bottom:15px;">${product.name}</h1>
        <div style="margin-bottom:15px;">
            <span style="font-size:32px;font-weight:700;color:#E63946;">GHS ${discountedPrice}</span>
            ${hasDiscount ? `<span style="font-size:18px;text-decoration:line-through;color:#999;margin-left:10px;">GHS ${parseFloat(product.price).toFixed(2)}</span>` : ''}
            ${product.wholesale_price ? `<div style="color:#1E3A8A;font-size:15px;margin-top:5px;">Wholesale: GHS ${parseFloat(product.wholesale_price).toFixed(2)}</div>` : ''}
        </div>
        <p style="color:#64748B;margin:15px 0;line-height:1.8;">${product.description || ''}</p>
        <div style="margin:10px 0;color:${product.in_stock ? '#10B981' : '#EF4444'};font-weight:600;">
            ${product.in_stock ? '✓ In Stock' : '✗ Out of Stock'}
        </div>
        <div style="display:flex;align-items:center;gap:15px;margin:20px 0;">
            <button onclick="updateQuantity(-1)" class="btn btn-outline" style="padding:8px 16px;">−</button>
            <span id="qty-display" style="font-size:20px;font-weight:bold;">1</span>
            <button onclick="updateQuantity(1)" class="btn btn-outline" style="padding:8px 16px;">+</button>
        </div>
        <div style="display:flex;gap:15px;flex-wrap:wrap;">
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
            : '<p style="text-align:center;padding:20px;color:#666;">No related products.</p>';
    }
}

// ============================================
// CART FUNCTIONS
// ============================================

function addToCart(productId) {
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
// PAGE: CART
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
        if (subtotalEl) subtotalEl.textContent = 'GHS 0.00';
        if (totalEl) totalEl.textContent = 'GHS 0.00';
        return;
    }

    container.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">Loading cart...</div>';

    const productPromises = cart.map(item => fetchProductById(item.id));
    const productDetails = await Promise.all(productPromises);

    let subtotal = 0;
    let html = '';

    cart.forEach((item, index) => {
        const product = productDetails[index];
        if (!product) return;

        const price = parseFloat(product.price);
        const lineTotal = price * item.quantity;
        subtotal += lineTotal;

        const imageUrl = product.image_url || product.image ||
            `https://placehold.co/80x80/1E3A8A/FFFFFF?text=${encodeURIComponent(product.name)}`;

        html += `
            <div style="display:flex;align-items:center;gap:15px;padding:15px;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;">
                <img src="${imageUrl}" alt="${product.name}"
                     onerror="this.src='https://placehold.co/80x80/1E3A8A/FFFFFF?text=Img'"
                     style="width:70px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;">
                <div style="flex:1;min-width:150px;">
                    <h4 style="color:#1E3A8A;margin-bottom:4px;">${product.name}</h4>
                    <div style="color:#E63946;font-weight:600;">GHS ${price.toFixed(2)}</div>
                    <button onclick="removeFromCart(${product.id})" style="background:none;border:none;color:#E63946;cursor:pointer;font-size:13px;margin-top:4px;">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button onclick="updateCartQuantity(${product.id}, -1)" style="width:30px;height:30px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;font-size:16px;">−</button>
                    <span style="font-weight:bold;min-width:20px;text-align:center;">${item.quantity}</span>
                    <button onclick="updateCartQuantity(${product.id}, 1)" style="width:30px;height:30px;border:1px solid #ddd;background:#fff;border-radius:4px;cursor:pointer;font-size:16px;">+</button>
                </div>
                <div style="font-weight:600;color:#1E3A8A;min-width:80px;text-align:right;">GHS ${lineTotal.toFixed(2)}</div>
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
        if (item.quantity <= 0) cart = cart.filter(i => i.id != productId);
    }
    localStorage.setItem('londusCart', JSON.stringify(cart));
    updateCartBadge();
    renderCart();
}

// ============================================
// CHECKOUT
// ============================================

async function handleCheckout(event) {
    event.preventDefault();
    const cart = JSON.parse(localStorage.getItem('londusCart')) || [];
    if (cart.length === 0) { showToast('Your cart is empty!', 'error'); return; }

    const locationEl = document.getElementById('delivery-location');
    const addressEl = document.querySelector('.checkout-form input[type="text"]');
    const phoneEl = document.querySelector('.checkout-form input[type="tel"]');
    const paymentEl = document.querySelector('input[name="payment"]:checked');

    if (!locationEl?.value) { showToast('Please select a delivery location!', 'error'); return; }
    if (!addressEl?.value) { showToast('Please enter your delivery address!', 'error'); return; }
    if (!phoneEl?.value) { showToast('Please enter your phone number!', 'error'); return; }
    if (!paymentEl) { showToast('Please select a payment method!', 'error'); return; }

    const subtotalEl = document.querySelector('.summary-subtotal');
    const total = subtotalEl ? parseFloat(subtotalEl.textContent.replace('GHS ', '')) : 0;

    const orderData = {
        items: cart,
        total: total,
        delivery_location: locationEl.value,
        delivery_address: addressEl.value,
        phone: phoneEl.value,
        payment_method: paymentEl.value,
        status: 'pending'
    };

    const btn = document.querySelector('.btn-checkout');
    if (btn) { btn.textContent = 'Placing Order...'; btn.disabled = true; }

    const success = await saveOrder(orderData);

    if (success) {
        localStorage.removeItem('londusCart');
        updateCartBadge();
        showToast('Order placed! We will contact you shortly.', 'success');
        setTimeout(() => window.location.href = 'index.html', 2500);
    } else {
        showToast('Something went wrong. Please try again.', 'error');
        if (btn) { btn.textContent = 'Proceed to Checkout'; btn.disabled = false; }
    }
}

// ============================================
// WHOLESALE
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
// UTILITIES
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
// INITIALIZE
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();

    const page = window.location.pathname.split('/').pop().replace('.html', '') || 'index';

    if (page === '' || page === 'index') {
        initHomePage();
    } else if (page === 'shop') {
        const params = new URLSearchParams(window.location.search);
        const cat = params.get('category');
        if (cat) currentFilters.category = cat;
        initShopPage();
    } else if (page === 'product') {
        initProductPage();
    } else if (page === 'cart') {
        renderCart();
    }
});

// Expose globally
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
window.renderCart = renderCart;
