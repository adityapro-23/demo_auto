require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { runAgent } = require('./agent/workflow');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*', // Allow frontend URL or all for dev
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
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

        console.log(`Starting agent for repo: ${repoUrl}, Team: ${teamName}`);

        // Start the agent workflow asynchronously (or await if we want to hold connection)
        // For a long running process, we should probably return a job ID, but specifications say "output results.json"
        // We'll await for now as per simple hackathon requirement implied by "The backend MUST generate a results.json file at the end"

        const result = await runAgent({ repoUrl, teamName, leaderName });

        res.status(200).json(result);

    } catch (error) {
        console.error('Agent execution failed:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`CORS allowed for: ${process.env.FRONTEND_URL}`);
});
