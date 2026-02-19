import { create } from 'zustand';

const useRunStore = create((set) => ({
    // Form Inputs
    repoUrl: '',
    teamName: '',
    leaderName: '',

    // Execution State
    runId: null,
    status: 'IDLE', // IDLE, RUNNING, PASSED, FAILED
    branchName: null,
    logs: [],
    fixes: [],

    // Metrics
    iterations: 0,
    filesScanned: 0,
    startTime: null,
    endTime: null,
    detectedEngines: null,

    // Actions
    setFormDetails: (details) => set((state) => ({ ...state, ...details })),

    startRun: () => set({
        status: 'RUNNING',
        logs: ['Initializing Agent...'],
        startTime: Date.now(),
        iterations: 0,
        filesScanned: 0,
        fixes: [],
        detectedEngines: null
    }),

    addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),

    updateFromBackend: (data) => set((state) => {
        // Merge backend data into state
        // We expect data to match the structure from orchestrator.js updates
        return {
            ...state,
            ...data,
            // If backend sends 'fixes' as complete array, replace it. 
            // If backend sends 'logs' as complete array, replace it.
        };
    }),

    reset: () => set({
        repoUrl: '',
        teamName: '',
        leaderName: '',
        runId: null,
        status: 'IDLE',
        branchName: null,
        logs: [],
        fixes: [],
        iterations: 0,
        filesScanned: 0,
        startTime: null,
        endTime: null,
        detectedEngines: null
    })
}));

export default useRunStore;
