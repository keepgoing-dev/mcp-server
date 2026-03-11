import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  readLicenseStore,
  removeLicenseEntry,
  getVariantLabel,
  deactivateLicense,
} from '@keepgoingdev/shared';

export function registerDeactivateLicense(server: McpServer) {
  server.tool(
    'deactivate_license',
    'Deactivate the KeepGoing Pro license on this device.',
    {
      license_key: z.string().optional().describe('Specific license key to deactivate. If omitted and only one license is active, deactivates it. If multiple are active, lists them.'),
    },
    async ({ license_key }) => {
      const store = readLicenseStore();
      const activeLicenses = store.licenses.filter(l => l.status === 'active');

      if (activeLicenses.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No active license found on this device.',
            },
          ],
        };
      }

      // Determine which license to deactivate
      let target;
      if (license_key) {
        target = activeLicenses.find(l => l.licenseKey === license_key);
        if (!target) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No active license found with key "${license_key}".`,
              },
            ],
          };
        }
      } else if (activeLicenses.length === 1) {
        target = activeLicenses[0];
      } else {
        // Multiple active licenses, ask user to specify
        const lines = ['Multiple active licenses found. Please specify which to deactivate using the license_key parameter:', ''];
        for (const l of activeLicenses) {
          const label = getVariantLabel(l.variantId);
          const who = l.customerName ? ` (${l.customerName})` : '';
          lines.push(`- ${label}${who}: ${l.licenseKey}`);
        }
        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      }

      const result = await deactivateLicense(target.licenseKey, target.instanceId);
      removeLicenseEntry(target.licenseKey);

      const label = getVariantLabel(target.variantId);

      if (!result.deactivated) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `${label} license cleared locally, but remote deactivation failed: ${result.error ?? 'unknown error'}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `${label} license deactivated successfully. The activation slot has been freed.`,
          },
        ],
      };
    },
  );
}
