import { PrimaryTabStack } from '@/navigation/primary-tab-stack';

// Expo Router orders a stack's routes by name length when nothing anchors it, so
// `history` would be this stack's first route: a fresh or remounted Profile tab then
// opens History as its root, with no way back. The anchor keeps Profile the root, under
// the tab and under every deep link into the stack.
export const unstable_settings = { anchor: 'profile' };

export default PrimaryTabStack;
