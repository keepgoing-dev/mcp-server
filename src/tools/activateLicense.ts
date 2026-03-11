import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  readLicenseStore,
  addLicenseEntry,
  getDeviceId,
  getVariantLabel,
  activateLicense,
  VARIANT_FEATURE_MAP,
} from '@keepgoingdev/shared';

export function registerActivateLicense(server: McpServer) {
  server.tool(
    'activate_license',
    'Activate a KeepGoing Pro license on this device. Unlocks add-ons like Decision Detection and Session Awareness.',
    { license_key: z.string().describe('Your KeepGoing Pro license key') },
    async ({ license_key }) => {
      // Check locally first to avoid consuming a remote activation slot unnecessarily
      const store = readLicenseStore();
      const existingForKey = store.licenses.find(
        l => l.status === 'active' && l.licenseKey === license_key,
      );
      if (existingForKey) {
        const label = getVariantLabel(existingForKey.variantId);
        const who = existingForKey.customerName ? ` (${existingForKey.customerName})` : '';
        return {
          content: [
            {
              type: 'text' as const,
              text: `${label} is already active${who}. No action needed.`,
            },
          ],
        };
      }

      const result = await activateLicense(license_key, getDeviceId());

      if (!result.valid) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Activation failed: ${result.error ?? 'unknown error'}`,
            },
          ],
        };
      }

      const variantId = result.variantId!;

      // Check if a different key already covers this variant
      const existingForVariant = store.licenses.find(
        l => l.status === 'active' && l.variantId === variantId,
      );
      if (existingForVariant) {
        const label = getVariantLabel(variantId);
        const who = existingForVariant.customerName ? ` (${existingForVariant.customerName})` : '';
        return {
          content: [
            {
              type: 'text' as const,
              text: `${label} is already active${who}. No action needed.`,
            },
          ],
        };
      }

      const now = new Date().toISOString();
      addLicenseEntry({
        licenseKey: result.licenseKey || license_key,
        instanceId: result.instanceId || getDeviceId(),
        status: 'active',
        lastValidatedAt: now,
        activatedAt: now,
        variantId,
        customerName: result.customerName,
        productName: result.productName,
        variantName: result.variantName,
      });

      const label = getVariantLabel(variantId);
      const features = VARIANT_FEATURE_MAP[variantId];
      const featureList = features ? features.join(', ') : 'Pro features';
      const who = result.customerName ? ` Welcome, ${result.customerName}!` : '';
      return {
        content: [
          {
            type: 'text' as const,
            text: `${label} activated successfully.${who} Enabled: ${featureList}.`,
          },
        ],
      };
    },
  );
}
