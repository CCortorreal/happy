import { useAuth } from "@/auth/AuthContext";
import * as React from 'react';
import { MainView } from "@/components/MainView";

// The classic session list — this is what (app)/index.tsx rendered before
// cockpit-v2 became the default landing surface (VISION check 8, code half).
// Preserved as-is at its own route so nothing that depended on the old
// session-list-first experience is lost, just moved.
export default function SessionsScreen() {
    const auth = useAuth();
    if (!auth.isAuthenticated) {
        return null;
    }
    return <MainView variant="phone" />;
}
