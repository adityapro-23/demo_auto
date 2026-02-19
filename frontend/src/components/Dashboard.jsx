import React, { useState, useEffect } from 'react';
import useRunStore from '../store/runStore';
import client from '../api/client';
import { Play, CheckCircle, XCircle, Clock, Activity, AlertTriangle, Terminal } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Mock data for initial visualization if needed
const mockTimelineData = [
    { name: 'Iter 1', status: 0 },
    { name: 'Iter 2', status: 0 },
    { name: 'Iter 3', status: 1 },
];

const Dashboard = () => {
    const {
        repoUrl, teamName, leaderName,
        setRepoUrl, setTeamName, setLeaderName,
        startRun, completeRun, failRun,
        isRunning, runStatus, logs, fixes, startTime, endTime, finalStatus, iterations
    } = useRunStore();

    const [elapsedTime, setElapsedTime] = useState(0);

    useEffect(() => {
        let interval;
        if (isRunning && startTime) {
            interval = setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        } else if (endTime && startTime) {
            setElapsedTime(Math.floor((endTime - startTime) / 1000));
        }
        return () => clearInterval(interval);
    }, [isRunning, startTime, endTime]);

    const handleRun = async () => {
        if (!repoUrl || !teamName || !leaderName) {
            alert("Please fill in all fields");
            return;
        }

        startRun();

        try {
            const response = await client.post('/api/run-agent', {
                repoUrl,
                teamName,
                leaderName
            });
            console.log("Run result:", response.data);
            completeRun({ passed: response.data.passed }); // Simplified completion
            // In a real implementation with streaming logs, we'd update periodically
            // But for this hackathon, we might just get the final result.
            // Ideally we should implement SSE or polling for live updates.
        } catch (error) {
            console.error("Run failed:", error);
            failRun(error);
        }
    };

    const branchName = `${teamName.toUpperCase().replace(/ /g, '_')}_${leaderName.toUpperCase().replace(/ /g, '_')}_AI_Fix`;

    // Score Calculation
    const baseScore = 100;
    const speedBonus = elapsedTime < 300 ? 10 : 0; // 5 mins = 300s
    const efficiencyPenalty = iterations > 5 ? (iterations - 5) * 2 : 0; // Example logic, user said "per commit over 20" but we track iterations
    // Adjust logic: Efficiency penalty (-2 per commit over 20). We need commit count.
    // Assuming fixes.length is roughly commit count for now.
    const commitCount = fixes.length;
    const commitPenalty = commitCount > 20 ? (commitCount - 20) * 2 : 0;

    const totalScore = baseScore + speedBonus - commitPenalty;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
            <header className="mb-8">
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
                    Autonomous CI/CD Healing Agent
                </h1>
                <p className="text-gray-400">RIFT 2026 Hackathon Edition</p>
            </header>

            {/* Input Section */}
            <section className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-gray-700">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Terminal size={20} /> Configuration
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <input
                        type="text"
                        placeholder="GitHub Repository URL"
                        className="bg-gray-700 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        disabled={isRunning}
                    />
                    <input
                        type="text"
                        placeholder="Team Name"
                        className="bg-gray-700 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        disabled={isRunning}
                    />
                    <input
                        type="text"
                        placeholder="Team Leader Name"
                        className="bg-gray-700 border border-gray-600 rounded p-3 text-white focus:outline-none focus:border-blue-500"
                        value={leaderName}
                        onChange={(e) => setLeaderName(e.target.value)}
                        disabled={isRunning}
                    />
                </div>
                <button
                    onClick={handleRun}
                    disabled={isRunning}
                    className={`w-full py-3 rounded font-bold text-lg flex items-center justify-center gap-2 transition-all
            ${isRunning ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-blue-500/20'}`}
                >
                    {isRunning ? (
                        <>
                            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                            Running Agent...
                        </>
                    ) : (
                        <>
                            <Play size={20} /> Run Agent Check
                        </>
                    )}
                </button>
            </section>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Summary & Score */}
                <div className="space-y-8">

                    {/* Run Summary Card */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Activity size={20} /> Run Summary
                        </h2>
                        <div className="space-y-3 text-gray-300">
                            <div className="flex justify-between">
                                <span>Repository:</span>
                                <span className="font-mono text-sm text-blue-400 truncate max-w-[150px]">{repoUrl || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Team:</span>
                                <span className="font-bold">{teamName || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Leader:</span>
                                <span className="font-bold">{leaderName || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Branch:</span>
                                <span className="font-mono text-xs text-green-400 truncate max-w-[150px]" title={branchName}>{branchName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Total Fixes:</span>
                                <span className="font-bold text-green-400">{fixes.length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Time Taken:</span>
                                <span className="font-mono">{Math.floor(elapsedTime / 60)}m {elapsedTime % 60}s</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center">
                                <span>Final Status:</span>
                                <span className={`px-3 py-1 rounded font-bold text-sm ${finalStatus === 'PASSED' ? 'bg-green-500/20 text-green-400 border border-green-500/50' :
                                        finalStatus === 'FAILED' ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                                            'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                                    }`}>
                                    {finalStatus}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Score Breakdown Panel */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <CheckCircle size={20} /> Score Breakdown
                        </h2>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span>Base Score:</span>
                                <span className="font-bold">100</span>
                            </div>
                            <div className="flex justify-between text-green-400">
                                <span>Speed Bonus (&lt;5m):</span>
                                <span>+{speedBonus}</span>
                            </div>
                            <div className="flex justify-between text-red-400">
                                <span>Efficiency Penalty (&gt;20 commits):</span>
                                <span>-{commitPenalty}</span>
                            </div>
                            <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center text-xl font-bold">
                                <span>Total Score:</span>
                                <span className="text-blue-400">{totalScore}</span>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full bg-gray-700 h-4 rounded-full mt-4 overflow-hidden">
                                <div
                                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-full transition-all duration-1000"
                                    style={{ width: `${Math.min(100, (totalScore / 110) * 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Right Column: Fixes & Timeline */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Fixes Applied Table */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Activity size={20} /> Fixes Applied
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-700/50 text-gray-300">
                                        <th className="p-3 border-b border-gray-700">File</th>
                                        <th className="p-3 border-b border-gray-700">Bug Type</th>
                                        <th className="p-3 border-b border-gray-700">Line</th>
                                        <th className="p-3 border-b border-gray-700">Commit Message</th>
                                        <th className="p-3 border-b border-gray-700">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fixes.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-4 text-center text-gray-500">No fixes applied yet.</td>
                                        </tr>
                                    ) : (
                                        fixes.map((fix, idx) => (
                                            <tr key={idx} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                                                <td className="p-3 font-mono text-sm text-blue-300">{fix.file}</td>
                                                <td className="p-3 text-xs bg-gray-700 rounded inline-block mt-2">{fix.type}</td>
                                                <td className="p-3 font-mono text-sm">{fix.line}</td>
                                                <td className="p-3 text-sm text-gray-300 truncate max-w-[200px]" title={fix.commitMessage}>{fix.commitMessage}</td>
                                                <td className="p-3">
                                                    <span className={`text-xs font-bold px-2 py-1 rounded ${fix.status === 'Fixed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                                        }`}>
                                                        {fix.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* CI/CD Status Timeline */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Clock size={20} /> CI/CD Timeline
                        </h2>
                        <div className="relative">
                            {/* Vertical line */}
                            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-700"></div>

                            <div className="space-y-6">
                                {logs.map((log, idx) => (
                                    <div key={idx} className="relative flex items-start gap-4">
                                        <div className={`mt-1 h-3 w-3 rounded-full border-2 ${log.includes('PASSED') ? 'bg-green-500 border-green-500' :
                                                log.includes('FAILED') ? 'bg-red-500 border-red-500' :
                                                    'bg-blue-500 border-blue-500'
                                            } z-10 ml-[21px]`}></div> // Adjusted margin

                                        <div className="bg-gray-700/50 p-3 rounded flex-1">
                                            <p className="text-sm font-mono text-gray-300">{log}</p>
                                            <span className="text-xs text-gray-500">{new Date().toLocaleTimeString()}</span>
                                        </div>
                                    </div>
                                ))}
                                {logs.length === 0 && (
                                    <p className="text-gray-500 italic ml-10">Waiting for agent execution...</p>
                                )}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Dashboard;
