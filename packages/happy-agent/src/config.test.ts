import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config';

describe('config', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        delete process.env.HAPPY_SERVER_URL;
        delete process.env.HAPPY_HOME_DIR;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    describe('defaults', () => {
        it('uses default server URL', () => {
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://api.cluster-fluster.com');
        });

        it('uses default home directory', () => {
            const config = loadConfig();
            expect(config.homeDir).toBe(join(homedir(), '.happy'));
        });

        it('derives credential path from home directory', () => {
            const config = loadConfig();
            expect(config.credentialPath).toBe(join(homedir(), '.happy', 'agent.key'));
        });
    });

    describe('env var overrides', () => {
        it('overrides server URL with HAPPY_SERVER_URL', () => {
            process.env.HAPPY_SERVER_URL = 'https://custom-server.example.com';
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://custom-server.example.com');
        });

        it('overrides home directory with HAPPY_HOME_DIR', () => {
            const customHomeDir = join(tmpdir(), 'custom-happy');
            process.env.HAPPY_HOME_DIR = customHomeDir;
            const config = loadConfig();
            expect(config.homeDir).toBe(customHomeDir);
        });

        it('derives credential path from overridden home directory', () => {
            const customHomeDir = join(tmpdir(), 'custom-happy');
            process.env.HAPPY_HOME_DIR = customHomeDir;
            const config = loadConfig();
            expect(config.credentialPath).toBe(join(customHomeDir, 'agent.key'));
        });

        it('allows both overrides simultaneously', () => {
            process.env.HAPPY_SERVER_URL = 'https://other.example.com';
            const customHomeDir = join(tmpdir(), 'opt', 'happy');
            process.env.HAPPY_HOME_DIR = customHomeDir;
            const config = loadConfig();
            expect(config.serverUrl).toBe('https://other.example.com');
            expect(config.homeDir).toBe(customHomeDir);
            expect(config.credentialPath).toBe(join(customHomeDir, 'agent.key'));
        });
    });
});
