const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Store all table data
let tablesData = {};
let sentOrdersData = {};

// Initialize tables
for (let i = 1; i <= 811; i++) {
    tablesData[i] = { open: false, orders: [] };
    sentOrdersData[i] = [];
}

// When a client connects
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Send current state to new client
    socket.emit('sync', {
        tables: tablesData,
        sentOrders: sentOrdersData
    });

    // Listen for table updates
    socket.on('updateTable', (data) => {
        const { tableId, tableData } = data;
        tablesData[tableId] = tableData;
        
        // Broadcast to all clients
        io.emit('tableUpdated', {
            tableId: tableId,
            tableData: tableData
        });
    });

    // Listen for orders update
    socket.on('updateOrders', (data) => {
        const { tableId, orders } = data;
        tablesData[tableId].orders = orders;
        
        // Broadcast to all clients
        io.emit('ordersUpdated', {
            tableId: tableId,
            orders: orders
        });
    });

    // Listen for sent orders update
    socket.on('updateSentOrders', (data) => {
        const { tableId, sentOrders } = data;
        sentOrdersData[tableId] = sentOrders;
        
        // Broadcast to all clients
        io.emit('sentOrdersUpdated', {
            tableId: tableId,
            sentOrders: sentOrders
        });
    });

    // Listen for complete data sync
    socket.on('syncData', (data) => {
        tablesData = data.tables;
        sentOrdersData = data.sentOrders;
        
        // Broadcast to all clients except sender
        socket.broadcast.emit('dataSync', data);
    });

    // Client disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ PDA System running on http://192.168.2.7:${PORT}`);
    console.log(`✓ Mobile: http://192.168.2.7:${PORT}`);
});
