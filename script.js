// ============ DATABASE MANAGEMENT ============
// IndexedDB for better offline storage
const DB_NAME = 'pdaRestaurant';
const DB_VERSION = 1;
let db = null;

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains('tables')) {
                database.createObjectStore('tables', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('sentOrders')) {
                database.createObjectStore('sentOrders', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('discounts')) {
                database.createObjectStore('discounts', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('cashier')) {
                database.createObjectStore('cashier', { keyPath: 'id' });
            }
        };
    });
}

// Save to both localStorage and IndexedDB
function saveToDatabase() {
    if (!db) return;
    
    try {
        // Save tables
        const transaction = db.transaction(['tables', 'sentOrders', 'discounts', 'cashier'], 'readwrite');
        
        // Clear and save tables
        transaction.objectStore('tables').clear();
        for (let i = 1; i <= 811; i++) {
            transaction.objectStore('tables').add({ id: i, data: tables[i] || { open: false, orders: [] } });
        }
        
        // Clear and save sentOrders
        transaction.objectStore('sentOrders').clear();
        for (let i = 1; i <= 811; i++) {
            transaction.objectStore('sentOrders').add({ id: i, data: sentOrders[i] || [] });
        }
        
        // Clear and save discounts
        transaction.objectStore('discounts').clear();
        for (let i = 1; i <= 811; i++) {
            transaction.objectStore('discounts').add({ id: i, data: tableDiscounts[i] || { type: null, value: 0 } });
        }
        
        // Save cashier total
        transaction.objectStore('cashier').clear();
        transaction.objectStore('cashier').add({ id: 'total', data: currentCashierTotal });
        
        localStorage.setItem('tables', JSON.stringify(tables));
        localStorage.setItem('sentOrders', JSON.stringify(sentOrders));
        localStorage.setItem('tableDiscounts', JSON.stringify(tableDiscounts));
        localStorage.setItem('currentCashierTotal', currentCashierTotal.toString());
    } catch(e) {
        console.error('Database save error:', e);
    }
}

// Load from IndexedDB or localStorage
function loadFromDatabase() {
    return new Promise((resolve) => {
        if (!db) {
            // Fallback to localStorage
            tables = JSON.parse(localStorage.getItem('tables')) || {};
            sentOrders = JSON.parse(localStorage.getItem('sentOrders')) || {};
            tableDiscounts = JSON.parse(localStorage.getItem('tableDiscounts')) || {};
            currentCashierTotal = parseFloat(localStorage.getItem('currentCashierTotal')) || 0;
            resolve();
            return;
        }
        
        try {
            const transaction = db.transaction(['tables', 'sentOrders', 'discounts', 'cashier'], 'readonly');
            let completed = 0;
            
            // Load tables
            const tablesReq = transaction.objectStore('tables').getAll();
            tablesReq.onsuccess = () => {
                tables = {};
                tablesReq.result.forEach(item => {
                    tables[item.id] = item.data;
                });
                if (++completed === 4) resolve();
            };
            
            // Load sentOrders
            const ordersReq = transaction.objectStore('sentOrders').getAll();
            ordersReq.onsuccess = () => {
                sentOrders = {};
                ordersReq.result.forEach(item => {
                    sentOrders[item.id] = item.data;
                });
                if (++completed === 4) resolve();
            };
            
            // Load discounts
            const discReq = transaction.objectStore('discounts').getAll();
            discReq.onsuccess = () => {
                tableDiscounts = {};
                discReq.result.forEach(item => {
                    tableDiscounts[item.id] = item.data;
                });
                if (++completed === 4) resolve();
            };
            
            // Load cashier
            const cashReq = transaction.objectStore('cashier').get('total');
            cashReq.onsuccess = () => {
                if (cashReq.result) {
                    currentCashierTotal = cashReq.result.data;
                }
                if (++completed === 4) resolve();
            };
        } catch(e) {
            console.error('Database load error:', e);
            resolve();
        }
    });
}

// ============ WEBSOCKET & ONLINE STATUS ============

// Initialize socket only if available
if (typeof io !== 'undefined') {
    socket = io();
} else {
    console.log('⚠ Socket.IO not available - running in offline mode');
}

let isInitialized = false;

// Initialize app with database
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await loadFromDatabase();
        console.log('✓ Database initialized');
    } catch(e) {
        console.error('Database init error:', e);
    }
    
    if (currentUser) startApp();
});

// Sync WebSocket events (only if socket exists)
if (socket) {
    socket.on('sync', (data) => {
        tables = data.tables;
        sentOrders = data.sentOrders;
        isInitialized = true;
        console.log('✓ Data synced from server');
        renderTables();
        if (currentTable) renderOrders();
    });

    socket.on('tableUpdated', (data) => {
        tables[data.tableId] = data.tableData;
        renderTables();
        if (currentTable === parseInt(data.tableId)) renderOrders();
    });

    socket.on('ordersUpdated', (data) => {
        tables[data.tableId].orders = data.orders;
        if (currentTable === parseInt(data.tableId)) renderOrders();
    });

    socket.on('sentOrdersUpdated', (data) => {
        sentOrders[data.tableId] = data.sentOrders;
        if (currentTable === parseInt(data.tableId)) renderOrders();
    });

    socket.on('dataSync', (data) => {
        tables = data.tables;
        sentOrders = data.sentOrders;
        renderTables();
        if (currentTable) renderOrders();
    });

    socket.on('disconnect', () => {
        console.log('⚠ Disconnected from server - switching to offline mode');
        isOnline = false;
    });
}

// Monitor online/offline status
function updateStatusIndicator() {
    const indicator = document.getElementById('onlineIndicator');
    const statusText = document.getElementById('statusText');
    
    if (!indicator || !statusText) return;
    
    if (isOnline) {
        indicator.classList.remove('offline');
        statusText.classList.remove('offline');
        statusText.textContent = 'Online';
    } else {
        indicator.classList.add('offline');
        statusText.classList.add('offline');
        statusText.textContent = 'Offline';
    }
}

window.addEventListener('online', () => {
    isOnline = true;
    console.log('✓ Back online');
    updateStatusIndicator();
    notify('✓ Σύνδεση ανακτήθηκε');
});

window.addEventListener('offline', () => {
    isOnline = false;
    console.log('⚠ Connection lost - using local data');
    updateStatusIndicator();
    notify('⚠ Χωρίς σύνδεση - χρησιμοποιώ τοπικά δεδομένα');
});

let tables = JSON.parse(localStorage.getItem("tables")) || {};
let sentOrders = JSON.parse(localStorage.getItem("sentOrders")) || {};
let cashierSessions = JSON.parse(localStorage.getItem("cashierSessions")) || [];
let tableDiscounts = JSON.parse(localStorage.getItem("tableDiscounts")) || {};
let currentTable = null;
let currentUser = localStorage.getItem("user");
let currentCashierTotal = parseFloat(localStorage.getItem("currentCashierTotal")) || 0;

if (Object.keys(tables).length === 0) {
    for (let i = 1; i <= 811; i++) {
        tables[i] = { open:false, orders:[] };
        sentOrders[i] = [];
        tableDiscounts[i] = { type: null, value: 0 };
    }
}

// Initialize discounts for any missing tables
for (let i = 1; i <= 811; i++) {
    if (!tableDiscounts[i]) {
        tableDiscounts[i] = { type: null, value: 0 };
    }
}

const users = [
    {username:"karkas", password:"1234", role:"admin"},
    {username:"admin2", password:"1111", role:"admin"},
    {username:"admin3", password:"2222", role:"admin"},
    {username:"owner", password:"9999", role:"owner"}
];

const tableContainer = document.getElementById("tables");

function login() {
    let u = document.getElementById("username").value;
    let p = document.getElementById("password").value;
    let user = users.find(x => x.username===u && x.password===p);
    if (user) {
        localStorage.setItem("user", u);
        startApp();
    } else alert("Λάθος στοιχεία");
}

function startApp() {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "block";
    let userInfo = localStorage.getItem("user");
    let userRole = users.find(u => u.username === userInfo)?.role || "unknown";
    document.getElementById("waiterName").innerText = "Χρήστης: " + userInfo + " (" + (userRole === "owner" ? "ΙΔΙΟΚΤΗΤΗΣ" : "ADMIN") + ")";
    
    // Update cashier button with current total
    let cashierBtn = document.getElementById("cashierBtn");
    if (cashierBtn) {
        cashierBtn.innerText = "💰 Ταμείο: " + currentCashierTotal.toFixed(2) + "€";
    }
    
    // Update status indicator
    updateStatusIndicator();
    
    renderTables();
    
    // Show cashier button for admins, owner gets history menu different
    const adminMenu = document.getElementById("adminMenu");
    if (userRole === "admin") {
        adminMenu.innerHTML = `
            <h4>Admin Επιλογές</h4>
            <button onclick="viewTableStats()">Στατιστικά</button>
            <button onclick="clearTableOrders()">Καθάρισμα Παραγγελιών</button>
            <button onclick="lockTable()">Κλείδωμα</button>
        `;
    }
}

if (currentUser) startApp();

function save() {
    saveToDatabase();
    // Send updated tables to all clients via WebSocket (only if online)
    if (socket && isOnline) {
        socket.emit('syncData', {
            tables: tables,
            sentOrders: sentOrders
        });
    }
}

function renderTables() {
    tableContainer.innerHTML = "";
    for (let i = 1; i <= 811; i++) {
        let div = document.createElement("div");
        let isOpen = tables[i].open;
        let isActive = currentTable == i;
        let isLocked = tables[i].locked || false;
        
        div.className = "table" + (isOpen ? " open" : "") + (isActive ? " active" : "") + (isLocked ? " locked" : "");
        div.innerText = i;
        div.onclick = () => selectTable(i);
        tableContainer.appendChild(div);
    }
}

function selectTable(id) {
    currentTable = id;
    document.getElementById("currentTable").innerText = id;
    
    // Hide tables, show panel as full screen
    document.querySelector(".tables").style.display = "none";
    document.querySelector(".panel").style.width = "100%";
    document.getElementById("tableBottomButtons").style.display = "none";
    
    renderTables();
    renderOrders();

    // Show control panels
    document.getElementById("controlsPanel").style.display = "block";
    document.getElementById("categoriesTitle").style.display = "block";
    document.getElementById("categoriesPanel").style.display = "flex";
    document.getElementById("ordersPanelContent").style.display = "block";

    // Admin menu visibility - Always show since all users are admins
    const adminMenu = document.getElementById("adminMenu");
    adminMenu.style.display = "block";
    
    // Show orders panel
    document.getElementById("ordersPanel").style.display = "block";
}

function openTable() {
    if (!currentTable) return;
    tables[currentTable].open = true;
    save();
    notify("Άνοιξε " + currentTable);
    renderTables();
}

function closeTable() {
    if (!currentTable) return;
    
    // Confirmation for all users
    if (!confirm("Σιγουρά να κλείσεις το τραπέζι " + currentTable + ";\nΌλες οι παραγγελίες θα διαγραφούν.")) {
        return;
    }
    
    // Calculate total amount from sent orders
    let tableTotal = (sentOrders[currentTable] || []).reduce((sum, o) => sum + o.price, 0);
    
    // Apply discount if exists
    let discountAmount = 0;
    if (tableDiscounts[currentTable] && tableDiscounts[currentTable].type && tableDiscounts[currentTable].value > 0) {
        if (tableDiscounts[currentTable].type === 'percentage') {
            discountAmount = tableTotal * (tableDiscounts[currentTable].value / 100);
        } else if (tableDiscounts[currentTable].type === 'fixed') {
            discountAmount = tableDiscounts[currentTable].value;
        }
    }
    tableTotal = Math.max(0, tableTotal - discountAmount);
    
    // Add to cashier total
    currentCashierTotal += tableTotal;
    localStorage.setItem("currentCashierTotal", currentCashierTotal.toString());
    
    // Clear all orders (current and sent)
    tables[currentTable] = { open:false, orders:[] };
    sentOrders[currentTable] = [];
    tableDiscounts[currentTable] = { type: null, value: 0 };
    save();
    localStorage.setItem("sentOrders", JSON.stringify(sentOrders));
    localStorage.setItem("tableDiscounts", JSON.stringify(tableDiscounts));
    
    // Update cashier button to show new total
    let cashierBtn = document.getElementById("cashierBtn");
    if (cashierBtn) {
        cashierBtn.innerText = "💰 Ταμείο: " + currentCashierTotal.toFixed(2) + "€";
    }
    
    notify("Έκλεισε " + currentTable + " | Ταμείο: " + currentCashierTotal.toFixed(2) + "€");
    renderTables();
    
    // Return to main menu after 500ms
    setTimeout(() => back(), 500);
}

function pay(type) {
    if (!currentTable) return;
    notify("Πληρωμή με " + (type=="cash" ? "μετρητά" : "κάρτα"));
}

function transferTable() {
    let target = prompt("Σε ποιο τραπέζι να γίνει μεταφορά;");
    if (!target || !tables[target]) return;
    tables[target].orders = tables[currentTable].orders;
    tables[currentTable].orders = [];
    save();
    notify("Μεταφορά στο τραπέζι " + target);
    renderOrders();
}

const categories = {
    food:[{name:"Burger",price:8},{name:"Pizza",price:10},{name:"Pasta",price:9}],
    wine:[{name:"Κόκκινο",price:6},{name:"Λευκό",price:6}],
    beer:[{name:"Heineken",price:4},{name:"Fix",price:3.5}],
    juice:[{name:"Πορτοκάλι",price:3},{name:"Μήλο",price:3}]
};

function loadCategory(cat) {
    const itemsDiv = document.getElementById("items");
    itemsDiv.innerHTML = "";
    categories[cat].forEach(item => {
        let div = document.createElement("div");
        div.className = "item";
        div.innerText = item.name + " (" + item.price + "€)";
        div.onclick = () => addOrder(item);
        itemsDiv.appendChild(div);
    });
}

function addOrder(item) {
    if (!currentTable) return;
    if (!tables[currentTable].open) {
        notify("Το τραπέζι " + currentTable + " είναι κλειστό");
        return;
    }
    if (tables[currentTable].locked) {
        notify("Το τραπέζι " + currentTable + " είναι κλειδωμένο");
        return;
    }

    tables[currentTable].orders.push({
        name: item.name,
        price: item.price,
        comment: ""
    });
    save();
    notify("Προστέθηκε: " + item.name);
    renderOrders();
}

function renderOrders() {
    const list = document.getElementById("orderList");
    const totalEl = document.getElementById("total");
    list.innerHTML = "";
    if (!currentTable) return;

    let total = 0;

    // Display sent orders (grouped)
    let sent = sentOrders[currentTable] || [];
    if (sent.length > 0) {
        let header = document.createElement("li");
        header.style.fontWeight = "bold";
        header.style.color = "#33cc33";
        header.style.marginBottom = "10px";
        header.innerText = "📦 Αποσταλθείσες Παραγγελίες:";
        list.appendChild(header);

        let grouped = {};
        sent.forEach(order => {
            if (!grouped[order.name]) {
                grouped[order.name] = { count: 0, price: order.price, comment: order.comment };
            }
            grouped[order.name].count++;
        });

        for (let name in grouped) {
            let item = grouped[name];
            let li = document.createElement("li");
            li.style.color = "#9d9";
            li.innerText = name + " x" + item.count + " (" + (item.price * item.count).toFixed(2) + "€)";
            if (item.comment) {
                li.innerText += " [" + item.comment + "]";
            }
            list.appendChild(li);
            total += item.price * item.count;
        }

        let divider = document.createElement("li");
        divider.style.borderTop = "1px solid #444";
        divider.style.margin = "10px 0";
        divider.innerText = "";
        list.appendChild(divider);
    }

    // Display current orders
    let hasCurrentOrders = tables[currentTable].orders.length > 0;
    if (hasCurrentOrders) {
        let header = document.createElement("li");
        header.style.fontWeight = "bold";
        header.style.color = "#fff";
        header.style.marginBottom = "10px";
        header.innerText = "📝 Τρέχουσες Παραγγελίες:";
        list.appendChild(header);
    }

    tables[currentTable].orders.forEach((o, idx) => {
        let li = document.createElement("li");

        let textSpan = document.createElement("span");
        textSpan.innerText = o.name + " - " + o.price + "€";

        li.appendChild(textSpan);

        if (o.comment) {
            let commentSpan = document.createElement("span");
            commentSpan.style.marginLeft = "10px";
            commentSpan.style.color = "#9d9";
            commentSpan.innerText = "(Σχόλιο: " + o.comment + ")";
            li.appendChild(commentSpan);
        }

        // All users can add comments
        let commentBtn = document.createElement("button");
        commentBtn.innerText = o.comment ? "Επεξεργασία σχολίου" : "Προσθήκη σχολίου";
        commentBtn.style.marginLeft = "10px";
        commentBtn.style.fontSize = "0.8em";
        commentBtn.onclick = () => {
            let newComment = prompt("Γράψε σχόλιο για το προϊόν:", o.comment || "");
            if (newComment !== null) {
                tables[currentTable].orders[idx].comment = newComment.trim();
                save();
                renderOrders();
            }
        };
        li.appendChild(commentBtn);

        let cancelBtn = document.createElement("button");
        cancelBtn.innerText = "✕ Ακύρωση";
        cancelBtn.style.marginLeft = "10px";
        cancelBtn.style.fontSize = "0.8em";
        cancelBtn.style.color = "#cc3333";
        cancelBtn.style.borderColor = "#cc3333";
        cancelBtn.onclick = () => {
            cancelOrder(idx);
        };
        li.appendChild(cancelBtn);

        list.appendChild(li);
        total += o.price;
    });

    // Calculate and display total with discount
    let discount = 0;
    let finalTotal = total;
    if (tableDiscounts[currentTable] && tableDiscounts[currentTable].type && tableDiscounts[currentTable].value > 0) {
        if (tableDiscounts[currentTable].type === 'percentage') {
            discount = total * (tableDiscounts[currentTable].value / 100);
        } else if (tableDiscounts[currentTable].type === 'fixed') {
            discount = tableDiscounts[currentTable].value;
        }
        finalTotal = Math.max(0, total - discount);
    }

    let totalDisplay = "Σύνολο: " + total.toFixed(2) + "€";
    if (discount > 0) {
        totalDisplay += " | Έκπτωση: -" + discount.toFixed(2) + "€ | Τελικό: " + finalTotal.toFixed(2) + "€";
    }
    totalEl.innerText = totalDisplay;
}

function notify(msg) {
    const n = document.getElementById("notification");
    n.innerText = msg;
    n.style.display = "block";
    setTimeout(() => n.style.display = "none", 2000);
}

function cancelOrder(idx) {
    if (!currentTable) return;
    let orderName = tables[currentTable].orders[idx].name;
    tables[currentTable].orders.splice(idx, 1);
    save();
    notify("Ακυρώθηκε: " + orderName);
    renderOrders();
}

function back() {
    currentTable = null;
    document.getElementById("currentTable").innerText = "Επιλέξτε Τραπέζι";
    
    // Show tables again, reset panel width
    document.querySelector(".tables").style.display = "grid";
    document.querySelector(".panel").style.width = "60%";
    document.getElementById("tableBottomButtons").style.display = "flex";
    
    document.getElementById("cashierPanel").style.display = "none";
    document.getElementById("ordersPanel").style.display = "none";
    document.getElementById("controlsPanel").style.display = "none";
    document.getElementById("categoriesTitle").style.display = "none";
    document.getElementById("categoriesPanel").style.display = "none";
    document.getElementById("ordersPanelContent").style.display = "none";
    document.getElementById("adminMenu").style.display = "none";
    document.getElementById("items").innerHTML = "";
    renderTables();
}

function logout() {
    if (confirm("Σιγουρά θέλεις να αποσυνδεθείς;")) {
        localStorage.removeItem("user");
        currentUser = null;
        document.getElementById("loginScreen").style.display = "block";
        document.getElementById("app").style.display = "none";
        document.getElementById("username").value = "";
        document.getElementById("password").value = "";
        currentTable = null;
    }
}

// Admin Functions
function viewTableStats() {
    if (!currentTable) return;
    let currentOrders = tables[currentTable].orders || [];
    let sentOrdersList = sentOrders[currentTable] || [];
    let totalItems = currentOrders.length + sentOrdersList.length;
    let totalPrice = currentOrders.reduce((sum, o) => sum + o.price, 0) + sentOrdersList.reduce((sum, o) => sum + o.price, 0);
    
    let message = "Τραπέζι " + currentTable + "\n\n";
    message += "📝 Τρέχουσες: " + currentOrders.length + "\n";
    message += "📦 Αποσταλθείσες: " + sentOrdersList.length + "\n";
    message += "━━━━━━━━━━━━━━━━\n";
    message += "Σύνολο Προϊόντων: " + totalItems + "\n";
    message += "Σύνολο: " + totalPrice.toFixed(2) + "€";
    
    alert(message);
}

function sendOrder() {
    if (!currentTable) return;
    if (tables[currentTable].orders.length === 0) {
        notify("Δεν υπάρχουν παραγγελίες για αποστολή");
        return;
    }
    
    // Store sent orders
    if (!sentOrders[currentTable]) {
        sentOrders[currentTable] = [];
    }
    
    tables[currentTable].orders.forEach(order => {
        sentOrders[currentTable].push({
            name: order.name,
            price: order.price,
            comment: order.comment
        });
    });
    
    localStorage.setItem("sentOrders", JSON.stringify(sentOrders));
    
    // Send order notification
    notify("Παραγγελία τραπεζιού " + currentTable + " στάλθηκε!");
    
    // Clear orders after sending
    tables[currentTable].orders = [];
    save();
    
    // Notify all clients
    if (socket && isOnline) {
        socket.emit('updateSentOrders', {
            tableId: currentTable,
            sentOrders: sentOrders[currentTable]
        });
    }
    
    // Auto-refresh the view to show sent orders
    renderOrders();
    
    // If the table view is not already visible, it will stay visible with the sent orders displayed
}

function clearTableOrders() {
    if (!currentTable) return;
    if (confirm("Σιγουρά να καθαρίσεις όλες τις παραγγελίες (τρέχουσες και αποσταλθείσες);")) {
        // Clear current and sent orders
        tables[currentTable].orders = [];
        sentOrders[currentTable] = [];
        save();
        localStorage.setItem("sentOrders", JSON.stringify(sentOrders));
        notify("Διαγράφηκαν όλες οι παραγγελίες του τραπεζιού " + currentTable);
        renderOrders();
    }
}

function lockTable() {
    if (!currentTable) return;
    let isLocked = tables[currentTable].locked || false;
    tables[currentTable].locked = !isLocked;
    save();
    notify(isLocked ? "Ξεκλειδώθηκε τραπέζι " + currentTable : "Κλειδώθηκε τραπέζι " + currentTable);
    renderTables();
}

// Discount functions
function applyPercentageDiscount() {
    if (!currentTable) return;
    let percent = prompt("Εισάγετε το ποσοστό έκπτωσης (%):");
    if (percent === null) return;
    
    percent = parseFloat(percent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
        notify("❌ Μη έγκυρο ποσοστό");
        return;
    }
    
    tableDiscounts[currentTable] = { type: 'percentage', value: percent };
    localStorage.setItem("tableDiscounts", JSON.stringify(tableDiscounts));
    notify("✓ Εφαρμόστηκε έκπτωση: " + percent + "%");
    renderOrders();
}

function applyFixedDiscount() {
    if (!currentTable) return;
    let amount = prompt("Εισάγετε το ποσό έκπτωσης (€):");
    if (amount === null) return;
    
    amount = parseFloat(amount);
    if (isNaN(amount) || amount < 0) {
        notify("❌ Μη έγκυρο ποσό");
        return;
    }
    
    tableDiscounts[currentTable] = { type: 'fixed', value: amount };
    localStorage.setItem("tableDiscounts", JSON.stringify(tableDiscounts));
    notify("✓ Εφαρμόστηκε έκπτωση: " + amount.toFixed(2) + "€");
    renderOrders();
}

function clearDiscount() {
    if (!currentTable) return;
    tableDiscounts[currentTable] = { type: null, value: 0 };
    localStorage.setItem("tableDiscounts", JSON.stringify(tableDiscounts));
    notify("✓ Αφαιρέθηκε η έκπτωση");
    renderOrders();
}

// Cashier functions
function openCashierMenu() {
    // Get current user role
    let userRole = users.find(u => u.username === currentUser)?.role || "unknown";
    
    // Show cashier panel, hide orders panel
    document.getElementById("ordersPanel").style.display = "none";
    document.getElementById("cashierPanel").style.display = "block";
    
    // Update total display
    let totalEl = document.getElementById("totalCashierAmount");
    if (totalEl) {
        totalEl.innerText = currentCashierTotal.toFixed(2) + "€";
    }
    
    // Update admin name display
    let adminEl = document.getElementById("cashierAdminName");
    if (adminEl) {
        adminEl.innerText = "Admin: " + currentUser;
    }
    
    // Show history and monitor buttons only for owner
    let historyBtn = document.getElementById("viewHistoryBtn");
    let monitorBtn = document.getElementById("liveMonitorBtn");
    if (historyBtn) {
        historyBtn.style.display = userRole === "owner" ? "block" : "none";
    }
    if (monitorBtn) {
        monitorBtn.style.display = userRole === "owner" ? "block" : "none";
    }
    
    notify("Άνοιξε Ταμείο");
}

function closeCashierSession() {
    if (!currentUser) {
        notify("❌ Δεν υπάρχει ενεργός χρήστης");
        return;
    }
    
    if (!confirm("Σιγουρά να κλείσεις το ταμείο με " + currentCashierTotal.toFixed(2) + "€;")) {
        return;
    }
    
    // Save cashier session
    let session = {
        admin: currentUser,
        amount: currentCashierTotal,
        date: new Date().toLocaleString('el-GR'),
        timestamp: new Date().getTime()
    };
    
    cashierSessions.push(session);
    localStorage.setItem("cashierSessions", JSON.stringify(cashierSessions));
    
    // Broadcast to owner's live monitor
    addToLiveMonitor(session);
    
    // Reset cashier total
    currentCashierTotal = 0;
    localStorage.setItem("currentCashierTotal", "0");
    
    // Update cashier button
    let cashierBtn = document.getElementById("cashierBtn");
    if (cashierBtn) {
        cashierBtn.innerText = "💰 Ταμείο: 0€";
    }
    
    notify("✓ Ταμείο κλειστό! Ποσό: " + session.amount.toFixed(2) + "€");
    
    // Hide cashier panel and go back
    document.getElementById("cashierPanel").style.display = "none";
    back();
}

// Live Monitor Functions
let liveMonitorData = [];

function addToLiveMonitor(session) {
    // Add to front of array (newest first)
    liveMonitorData.unshift(session);
    // Keep only last 50 entries
    if (liveMonitorData.length > 50) {
        liveMonitorData = liveMonitorData.slice(0, 50);
    }
}

function openLiveMonitor() {
    // Check if owner
    let userRole = users.find(u => u.username === currentUser)?.role || "unknown";
    if (userRole !== "owner") {
        notify("❌ Δεν έχετε πρόσβαση");
        return;
    }
    
    // Hide cashier panel, show live monitor
    document.getElementById("cashierPanel").style.display = "none";
    document.getElementById("liveMonitorPanel").style.display = "block";
    updateLiveMonitorDisplay();
}

function updateLiveMonitorDisplay() {
    const container = document.getElementById("liveMonitorContent");
    
    if (liveMonitorData.length === 0) {
        container.innerHTML = `<p style="color:#888; text-align:center; padding:20px;">Αναμονή για κλεισίματα ταμείου...</p>`;
        return;
    }
    
    let html = "";
    liveMonitorData.forEach((session, idx) => {
        let dateObj = new Date(session.timestamp);
        let dayName = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'][dateObj.getDay()];
        let hours = String(dateObj.getHours()).padStart(2, '0');
        let minutes = String(dateObj.getMinutes()).padStart(2, '0');
        
        html += `
            <div style="background: linear-gradient(135deg, #1a3a1a 0%, #0f2a0f 100%); padding:15px; border-radius:10px; border-left:4px solid #00ff88; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <p style="color:#00ff88; font-weight:700; font-size:16px; margin:0 0 5px 0;">👤 ${session.admin}</p>
                    <p style="color:#888; font-size:12px; margin:0;">🕐 ${hours}:${minutes} - ${dayName}</p>
                </div>
                <div style="text-align:right;">
                    <p style="color:#00ff88; font-size:24px; font-weight:700; margin:0;">€${session.amount.toFixed(2)}</p>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function viewCashierHistory() {
    // Check if user is owner
    let userRole = users.find(u => u.username === currentUser)?.role || "unknown";
    if (userRole !== "owner") {
        notify("❌ Δεν έχετε πρόσβαση");
        return;
    }
    
    let modal = document.createElement("div");
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8); display: flex; align-items: center;
        justify-content: center; z-index: 2000; overflow-y: auto;
    `;
    
    let content = document.createElement("div");
    content.style.cssText = `
        background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
        padding: 30px; border-radius: 12px; max-width: 700px; width: 95%;
        border: 2px solid #ffa500; box-shadow: 0 8px 32px rgba(255, 165, 0, 0.3);
        max-height: 85vh; overflow-y: auto; margin: 20px auto;
    `;
    
    let html = `<h2 style="color: #ffa500; text-align: center; margin: 0 0 30px 0;">📊 Ιστορικό Κλεισίματος Ταμείου</h2>`;
    
    if (cashierSessions.length === 0) {
        html += `<p style="color: #999; text-align: center;">Δεν υπάρχουν εγγραφές ταμείου</p>`;
    } else {
        // Sort by timestamp descending
        let sorted = [...cashierSessions].sort((a, b) => b.timestamp - a.timestamp);
        let totalAmount = sorted.reduce((sum, s) => sum + s.amount, 0);
        
        // Summary card
        html += `<div style="background: linear-gradient(135deg, #1a3a1a 0%, #0f2a0f 100%); padding:20px; border-radius:12px; border-left:4px solid #00ff88; margin-bottom:25px;">
            <p style="color:#00ff88; font-size:14px; font-weight:700; margin:0 0 8px 0;">📈 ΣΥΝΟΛΙΚΟ ΠΟΣΟ ΣΕ ΟΛΑ ΤΑ ΚΛΕΙΣΙΜΑΤΑ</p>
            <p style="color:#00ff88; font-size:28px; font-weight:700; margin:0;">€${totalAmount.toFixed(2)}</p>
            <p style="color:#888; font-size:12px; margin:8px 0 0 0;">Σύνολο εγγραφών: ${sorted.length}</p>
        </div>`;
        
        // Individual entries
        sorted.forEach((session, idx) => {
            // Parse the date to get better formatting
            let dateObj = new Date(session.timestamp);
            let dayName = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'][dateObj.getDay()];
            let hours = String(dateObj.getHours()).padStart(2, '0');
            let minutes = String(dateObj.getMinutes()).padStart(2, '0');
            
            html += `
                <div style="background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%); padding:15px; border-radius:10px; border-left:4px solid #ff9933; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                            <span style="color:#ff9933; font-weight:700; font-size:16px;">👤 ${session.admin}</span>
                        </div>
                        <div style="color:#aaa; font-size:13px;">
                            <p style="margin:4px 0;">📅 ${dayName}, ${session.date}</p>
                        </div>
                    </div>
                    <div style="text-align:right; min-width:120px;">
                        <p style="color:#00ff88; font-size:24px; font-weight:700; margin:0;">€${session.amount.toFixed(2)}</p>
                    </div>
                </div>
            `;
        });
    }
    
    html += `<button onclick="this.closest('div').parentElement.remove();" style="
        width: 100%; padding: 12px; margin-top: 20px;
        background: linear-gradient(135deg, #666 0%, #444 100%); color: #fff; border: none; border-radius: 8px;
        cursor: pointer; font-weight: 700; transition: all 0.2s;
    " onmouseover="this.style.background='linear-gradient(135deg, #777 0%, #555 100%)'" onmouseout="this.style.background='linear-gradient(135deg, #666 0%, #444 100%)'">Κλείσιμο</button>`;
    
    content.innerHTML = html;
    modal.appendChild(content);
    document.body.appendChild(modal);
    modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
}

renderTables();
