const express = require("express");
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config();
const pool = require('./db');

const app = express();
const customerTableSql = fs.readFileSync(
    path.join(__dirname, '..', 'database', 'db.sql'),
    'utf8'
);

// settings
app.set('port', process.env.PORT || 8080);

// middlewares
app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
        console.log(
            `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`
        );
    });
    next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..', 'frontend')));

// routes
const customerRoutes = require('./routes/customer');
app.use('/api', customerRoutes);

app.get('/health', (req, res) => {
    res.json({ status: "OK", host: os.hostname() });
});

app.get('/health/db', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: "OK", host: os.hostname() });
    } catch (error) {
        console.error('Database health check failed:', error);
        res.status(500).json({ status: "ERROR", error: 'Database unavailable' });
    }
});

async function initializeDatabase(maxAttempts = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await pool.query(customerTableSql);
            console.log('Customer table is ready.');
            return;
        } catch (error) {
            console.error(`Database initialization attempt ${attempt} failed:`, error);
            if (attempt === maxAttempts) {
                throw error;
            }

            console.error(
                `Database is not ready (attempt ${attempt}/${maxAttempts}); retrying in 2 seconds.`
            );
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

async function startServer() {
    await initializeDatabase();

    const server = app.listen(app.get('port'), () => {
        console.log(`Server running on port ${app.get('port')}`);
    });

    let shuttingDown = false;
    const shutdown = async signal => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        console.log(`${signal} received; closing server and database pool.`);

        try {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
            });
            await pool.end();
            console.log('Server and database pool closed.');
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exitCode = 1;
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch(async error => {
    console.error('Unable to start server:', error);
    try {
        await pool.end();
    } catch (closeError) {
        console.error('Unable to close database pool:', closeError);
    }
    process.exitCode = 1;
});
