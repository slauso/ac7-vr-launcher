import type { AC7Api } from '@shared/types';

declare global {
  interface Window {
    ac7: AC7Api;
  }
}

export {};
