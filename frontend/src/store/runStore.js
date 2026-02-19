import { create } from 'zustand';

const useRunStore = create((set) => ({
    // Input State
    repoUrl: '',
    teamName: '',
    leaderName: '',
    setRepoUrl: (url) => set({ repoUrl: url }),
    setTeamName: (name) => set({ teamName: name }),
    setLeaderName: (name) => set({ leaderName: name }),

    // Run State
    isRunning: false,
    runStatus: 'IDLE', // IDLE, RUNNING, COMPLETED, FAILED
    logs: [],
    fixes: [],
    startTime: null,
    endTime: null,

    // Results
    finalStatus: 'PENDING', // PENDING, PASSED, FAILED
    iterations: 0,
    totalFailures: 0,

    // Actions
    startRun: () => set({
        isRunning: true,
        runStatus: 'RUNNING',
        logs: [],
        fixes: [],
        startTime: Date.now(),
        endTime: null,
        finalStatus: 'PENDING',
        iterations: 0,
        totalFailures: 0
    }),

    updateRun: (data) => set((state) => ({
        logs: data.logs || state.logs,
        fixes: data.fixesApplied || state.fixes,
        iterations: data.iteration || state.iterations,
        // Add logic to update status based on logs or specific fields if backend pushes partial updates
    })),

    completeRun: (result) => set({
        isRunning: false,
        runStatus: 'COMPLETED',
        endTime: Date.now(),
        finalStatus: result.passed ? 'PASSED' : 'FAILED',
        // totalFailures logic needs to be derived from logs or backend result
    }),

    failRun: (error) => set({
        isRunning: false,
        runStatus: 'FAILED',
        logs: (state) => [...state.logs, `Error: ${error.message}`]
    })
}));

export default useRunStore;
