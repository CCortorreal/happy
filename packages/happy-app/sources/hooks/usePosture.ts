import { useWindowDimensions } from 'react-native';
import { type Density } from '@/app/(app)/dev/cockpit/density';

// ============================================================================
// usePosture — resolves the AUTO-detected cockpit posture from window width.
//
// Judge graft 7: the deck posture is NEVER auto-detected. A couch is not a
// width — nothing about the viewport tells us the operator is leaning back on
// a controller. So auto resolves ONLY two values:
//   - width >= 1180 → 'desktop'  (the NOC grid: three regions side-by-side)
//   - width  < 1180 → 'phone'    (today's single vertical column)
// 'deck' exists SOLELY through the dev-only override picker; it is a deliberate
// operator choice, not an inference. Re-postures live on resize/rotation
// because useWindowDimensions re-renders on dimension change.
// ============================================================================

const DESKTOP_MIN_WIDTH = 1180;

export function usePosture(): Density {
    const { width } = useWindowDimensions();
    return width >= DESKTOP_MIN_WIDTH ? 'desktop' : 'phone';
}
