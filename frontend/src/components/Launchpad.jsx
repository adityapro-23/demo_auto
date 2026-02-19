import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useRunStore from '../store/runStore';
import { Play, Link as LinkIcon, Users, User, Bolt, Activity, Terminal, Shield } from 'lucide-react';
import axios from 'axios';

const Launchpad = () => {
    const navigate = useNavigate();
    const { setFormDetails, startRun } = useRunStore();

    const [formData, setFormData] = useState({
        repoUrl: '',
        teamName: '',
        leaderName: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            setFormDetails(formData);
            startRun();

            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
            try {
                await axios.post(`${backendUrl}/api/run-agent`, formData);
            } catch (err) {
                console.warn("Backend might not be ready, proceeding to dashboard anyway for demo", err);
            }

            navigate('/dashboard');
        } catch (err) {
            setError('Failed to start agent. Please check backend connection.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background-dark font-display text-slate-100 relative overflow-x-hidden">
            {/* Background Elements */}
            <div className="fixed inset-0 grid-bg pointer-events-none opacity-50"></div>
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full pointer-events-none"></div>
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none"></div>

            <div className="relative z-10 flex flex-col min-h-screen">
                {/* Top Navigation */}
                <header className="flex items-center px-6 py-4 md:px-12 border-b border-border-dark bg-background-dark/80 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary rounded-lg text-white">
                            <Activity className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-bold tracking-tight text-white">
                            AutoHeal <span className="text-primary">Agent</span>
                        </h2>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-grow flex flex-col items-center justify-center px-4 py-12 md:py-20 text-center">
                    <div className="max-w-4xl w-full space-y-8">
                        {/* Status Badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest mb-4">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            AI System Online
                        </div>

                        {/* Hero Section */}
                        <h1 className="text-5xl md:text-7xl font-black text-white leading-[1.1] tracking-tighter">
                            Autonomous CI/CD <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">Healing Agent</span>
                        </h1>
                        <p className="text-lg md:text-xl text-text-muted-dark max-w-2xl mx-auto font-light">
                            Identify, debug, and patch pipeline failures in real-time with AI-driven precision. Experience the future of automated DevOps.
                        </p>

                        {/* Glassmorphism Form Container */}
                        <div className="mt-12 glass-panel p-8 md:p-10 rounded-2xl shadow-2xl max-w-2xl mx-auto w-full text-left">
                            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                                <div className="space-y-1.5">
                                    <h3 className="text-lg font-bold text-white">Initialize Your Agent</h3>
                                    <p className="text-sm text-text-muted-dark">Enter your repository details to begin the autonomous monitoring.</p>
                                </div>

                                <div className="space-y-4">
                                    {/* Input: Repository */}
                                    <div className="group space-y-2">
                                        <label className="text-sm font-semibold text-slate-300 ml-1">GitHub Repository URL</label>
                                        <div className="relative rounded-xl transition-all border border-border-dark bg-slate-900/50 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary">
                                            <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                            <input
                                                className="w-full bg-transparent border-none rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:ring-0 focus:outline-none transition-all"
                                                placeholder="https://github.com/organization/repository"
                                                type="url"
                                                name="repoUrl"
                                                required
                                                value={formData.repoUrl}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Input: Team Name */}
                                        <div className="group space-y-2">
                                            <label className="text-sm font-semibold text-slate-300 ml-1">Team Name</label>
                                            <div className="relative rounded-xl transition-all border border-border-dark bg-slate-900/50 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary">
                                                <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                                <input
                                                    className="w-full bg-transparent border-none rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:ring-0 focus:outline-none transition-all"
                                                    placeholder="Engineering Alpha"
                                                    type="text"
                                                    name="teamName"
                                                    required
                                                    value={formData.teamName}
                                                    onChange={handleChange}
                                                />
                                            </div>
                                        </div>
                                        {/* Input: Leader Name */}
                                        <div className="group space-y-2">
                                            <label className="text-sm font-semibold text-slate-300 ml-1">Team Leader Name</label>
                                            <div className="relative rounded-xl transition-all border border-border-dark bg-slate-900/50 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary">
                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                                                <input
                                                    className="w-full bg-transparent border-none rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-slate-600 focus:ring-0 focus:outline-none transition-all"
                                                    placeholder="Enter leader name..."
                                                    type="text"
                                                    name="leaderName"
                                                    required
                                                    value={formData.leaderName}
                                                    onChange={handleChange}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* CTA Button */}
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full group relative overflow-hidden bg-primary text-white rounded-xl py-5 font-bold text-lg shadow-xl shadow-primary/30 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-70"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                                    <span className="flex items-center justify-center gap-3">
                                        {isLoading ? 'Initializing Agent...' : (
                                            <>
                                                Start Healing Agent
                                                <Bolt className="w-5 h-5 animate-pulse fill-white" />
                                            </>
                                        )}
                                    </span>
                                </button>
                                {error && <p className="text-accent-red text-center text-sm">{error}</p>}
                            </form>
                        </div>
                    </div>
                </main>


                {/* Footer */}
                <footer className="px-6 md:px-12 py-8 border-t border-border-dark flex flex-col md:flex-row justify-between items-center gap-6">
                    <p className="text-text-muted-dark text-sm">© 2024 AutoHeal Systems Inc. All rights reserved.</p>
                    <div className="flex gap-6 text-text-muted-dark text-sm">
                        <a className="hover:text-primary transition-colors cursor-pointer">Privacy Policy</a>
                        <a className="hover:text-primary transition-colors cursor-pointer">Terms of Service</a>
                        <a className="hover:text-primary transition-colors cursor-pointer">Status</a>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default Launchpad;
