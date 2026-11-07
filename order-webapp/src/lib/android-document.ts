import { registerPlugin } from '@capacitor/core';

interface SaveDocumentPlugin {
  save(options: { name: string; data: string }): Promise<{ saved: boolean }>;
}

export const saveDocument = registerPlugin<SaveDocumentPlugin>('SaveDocument');
