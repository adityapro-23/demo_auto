require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { startOrchestrator } = require('./agents/orchestrator');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*', // Allow frontend URL or all for dev
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
    sameSite: 'lax',
    httpOnly: true,
}));
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/run-agent', async (req, res) => {
    try {
        const { repoUrl, teamName, leaderName } = req.body;

        if (!repoUrl || !teamName || !leaderName) {
            return res.status(400).json({ error: 'Missing required fields: repoUrl, teamName, leaderName' });
        }

        console.log(`Starting MAS Orchestrator for repo: ${repoUrl}, Team: ${teamName}`);

        // Fire and forget (Orchestrator updates results.json independently)
        // We return initial success so frontend can start polling
        startOrchestrator(repoUrl, teamName, leaderName).catch(err => {
            console.error("Orchestrator async error:", err);
        });

        res.status(200).json({ status: 'STARTED', message: 'Agent execution started' });

    } catch (error) {
        console.error('Agent execution start failed:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.get('/api/results', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const resultsPath = path.resolve(__dirname, '../../results.json');

    if (fs.existsSync(resultsPath)) {
        try {
            const data = fs.readFileSync(resultsPath, 'utf8');
            res.status(200).json(JSON.parse(data));
        } catch (e) {
            res.status(500).json({ error: 'Failed to read results' });
        }
    } else {
        res.status(404).json({ status: 'PENDING', message: 'No results yet' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`CORS allowed for: ${process.env.FRONTEND_URL}`);
});
