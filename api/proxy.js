const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('/api/*', async (req, res) => {
    if (req.path === '/api/health') {
        return res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'FPL Proxy server is running'
        });
    }
    
    try {
        const apiPath = req.path.substring(4);
        const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
        const targetUrl = `https://fantasy.premierleague.com/api${apiPath}${queryString}`;

        console.log(`Proxying: ${req.method} ${req.originalUrl} -> ${targetUrl}`);

        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; FPL-Proxy/1.0)',
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate, br',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Set response status and important headers
        res.status(response.status);
        
        // Copy content-type header
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.set('content-type', contentType);
        }

        // Get the response as text first, then parse
        const responseText = await response.text();
        
        try {
            const data = JSON.parse(responseText);
            res.json(data);
        } catch (parseError) {
            // If JSON parsing fails, send as text
            res.send(responseText);
        }

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: 'Proxy server error',
            message: error.message,
            path: req.path
        });
    }
});

app.all('/proxy', async (req, res) => {
    try {
        const targetUrl = req.query.url;

        if (!targetUrl) {
            return res.status(400).json({
                error: 'Missing URL parameter. Use: /proxy?url=YOUR_API_URL'
            });
        }

        let url;
        try {
            url = new URL(targetUrl);
        } catch (error) {
            return res.status(400).json({
                error: 'Invalid URL format'
            });
        }

        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'User-Agent': 'FPL-Proxy/1.0',
                'Accept': 'application/json',
            },
            body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
        });

        const data = await response.text();
        res.status(response.status);

        const headersToProxy = ['content-type', 'cache-control', 'expires', 'last-modified'];
        headersToProxy.forEach(header => {
            const value = response.headers.get(header);
            if (value) {
                res.set(header, value);
            }
        });

        try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
        } catch {
            res.send(data);
        }

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

app.get('/', (req, res) => {
    res.json({
        message: 'FPL Proxy Server',
        description: 'This proxy forwards /api/* requests to fantasy.premierleague.com/api/*',
        usage: {
            'FPL Bootstrap': 'GET /api/bootstrap-static/',
            'FPL Fixtures': 'GET /api/fixtures/',
            'FPL Manager': 'GET /api/entry/{team-id}/',
            'FPL Gameweek Live': 'GET /api/event/{event-id}/live/',
            'Health Check': 'GET /api/health'
        },
        examples: [
            '/api/bootstrap-static/',
            '/api/fixtures/',
            '/api/entry/1/history/',
            '/api/event/1/live/'
        ],
        note: 'Simply replace your Angular app base URL with this proxy URL and keep the same /api/* paths'
    });
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Proxy server running on port ${PORT}`);
    });
}

module.exports = app;
