import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../logger.js";
import { returnToolError, returnToolSuccess } from "../utils.js";
import type { ToolContext, ToolModule } from "./index.js";

// Schemas
const TailnetInfoSchema = z.object({});

const FileSharingSchema = z.object({
  operation: z
    .enum(["get_status", "enable", "disable"])
    .describe("File sharing operation to perform"),
  deviceId: z
    .string()
    .optional()
    .describe("Device ID (for device-specific operations)"),
});

const ExitNodeSchema = z.object({
  operation: z
    .enum(["list", "set", "clear", "advertise", "stop_advertising"])
    .describe("Exit node operation to perform"),
  deviceId: z
    .string()
    .optional()
    .describe("Device ID for exit node operations"),
  routes: z
    .array(z.string())
    .optional()
    .describe(
      'Routes to advertise (required for "advertise" operation, e.g., ["0.0.0.0/0", "::/0"] for full exit node)',
    ),
});

const WebhookSchema = z.object({
  operation: z
    .enum(["list", "create", "delete"])
    .describe("Webhook operation to perform"),
  webhookId: z.string().optional().describe("Webhook ID for delete operation"),
  config: z
    .object({
      endpointUrl: z.string(),
      description: z.string().optional(),
      events: z.array(z.string()),
      secret: z.string().optional(),
    })
    .optional()
    .describe("Webhook configuration for create operation"),
});

const DeviceTaggingSchema = z.object({
  operation: z
    .enum(["get_tags", "set_tags", "add_tags", "remove_tags"])
    .describe("Device tagging operation to perform"),
  deviceId: z.string().describe("Device ID for tagging operations"),
  tags: z
    .array(z.string())
    .optional()
    .describe(
      'Array of tags to manage (e.g., ["tag:server", "tag:production"])',
    ),
});

const UserManagementSchema = z.object({
  operation: z
    .enum(["list", "delete"])
    .describe(
      "User management operation: list (列出所有用户), delete (删除用户)",
    ),
  userId: z
    .string()
    .optional()
    .describe("User ID (required for delete operation)"),
});

const ContactsSchema = z.object({
  operation: z
    .enum(["get", "update"])
    .describe("Contacts operation: get (查询联系人), update (更新联系人)"),
  contacts: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("联系人信息 (required for update operation)"),
});

const LogStreamSchema = z.object({
  operation: z
    .enum(["get", "create", "delete"])
    .describe("Log stream operation"),
  logType: z
    .enum(["configuration", "network"])
    .describe(
      "日志类型: configuration (配置变更日志) 或 network (网络流量日志)",
    ),
  streamId: z
    .string()
    .optional()
    .describe("Stream ID (required for delete operation)"),
  config: z
    .object({
      destinationUrl: z.string().describe("日志接收端 URL"),
    })
    .optional()
    .describe("日志流配置 (required for create operation)"),
});

const DeviceAttributesSchema = z.object({
  operation: z
    .enum(["get", "set", "delete"])
    .describe("Device attributes operation"),
  deviceId: z.string().describe("Device ID"),
  key: z
    .string()
    .optional()
    .describe("Attribute key (required for set/delete)"),
  value: z.unknown().optional().describe("Attribute value (required for set)"),
});

const TailnetSettingsSchema = z.object({
  operation: z
    .enum(["get", "update"])
    .describe("Tailnet settings operation: get (查询) or update (更新)"),
  settings: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("要更新的设置项 (required for update operation)"),
});

// Tool handlers
async function getTailnetInfo(
  _args: z.infer<typeof TailnetInfoSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Getting tailnet information");

    const result = await context.api.getDetailedTailnetInfo();
    if (!result.success) {
      return returnToolError(result.error);
    }

    // /settings 端点返回的字段与老 /tailnet/{tailnet} 不同
    // 直接展示 settings 实际返回的数据
    const info = result.data as Record<string, unknown> | undefined;
    if (!info || Object.keys(info).length === 0) {
      return returnToolSuccess("Tailnet settings: no data returned");
    }

    let formattedInfo = "**Tailnet Settings**\n\n";
    for (const [key, value] of Object.entries(info)) {
      if (typeof value === "boolean") {
        formattedInfo += `  - ${key}: ${value ? "Enabled" : "Disabled"}\n`;
      } else if (value !== null && value !== undefined) {
        formattedInfo += `  - ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}\n`;
      }
    }

    return returnToolSuccess(formattedInfo);
  } catch (error) {
    logger.error("Error getting tailnet info:", error);

    return returnToolError(error);
  }
}

async function manageFileSharing(
  args: z.infer<typeof FileSharingSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing file sharing:", args);

    switch (args.operation) {
      case "get_status": {
        const result = await context.api.getFileSharingStatus();
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `File Sharing Status: ${
            result.data?.fileSharing ? "Enabled" : "Disabled"
          }`,
        );
      }

      case "enable": {
        const result = await context.api.setFileSharingStatus(true);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess("File sharing enabled successfully");
      }

      case "disable": {
        const result = await context.api.setFileSharingStatus(false);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess("File sharing disabled successfully");
      }

      default:
        return returnToolError(
          "Invalid file sharing operation. Use: get_status, enable, or disable",
        );
    }
  } catch (error) {
    logger.error("Error managing file sharing:", error);
    return returnToolError(error);
  }
}

async function manageExitNodes(
  args: z.infer<typeof ExitNodeSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing exit nodes:", args);

    switch (args.operation) {
      case "list": {
        const devicesResult = await context.api.listDevices();
        if (!devicesResult.success) {
          return returnToolError(devicesResult.error);
        }

        const devices = devicesResult.data || [];
        const exitNodes = devices.filter(
          (device) =>
            device.advertisedRoutes?.includes("0.0.0.0/0") ||
            device.advertisedRoutes?.includes("::/0"),
        );

        if (exitNodes.length === 0) {
          return returnToolSuccess("No exit nodes found in the network");
        }

        const exitNodeList = exitNodes
          .map((node) => {
            return `**${node.name}** (${node.hostname})
  - ID: ${node.id}
  - OS: ${node.os}
  - Routes: ${node.advertisedRoutes?.join(", ") || "None"}
  - Status: ${node.authorized ? "Authorized" : "Unauthorized"}`;
          })
          .join("\n\n");

        return returnToolSuccess(
          `Exit Nodes (${exitNodes.length}):\n\n${exitNodeList}`,
        );
      }

      case "advertise": {
        if (!args.deviceId) {
          return returnToolError(
            "Device ID is required for advertise operation",
          );
        }
        if (!args.routes || args.routes.length === 0) {
          return returnToolError(
            "At least one route is required for advertise operation (e.g., ['0.0.0.0/0', '::/0'] for full exit node)",
          );
        }

        const result = await context.api.setDeviceExitNode(
          args.deviceId,
          args.routes,
        );
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Device ${
            args.deviceId
          } is now advertising routes: ${args.routes.join(", ")}`,
        );
      }

      case "set": {
        const nodeId = args.deviceId ?? "";
        const cliResult = await context.cli.setExitNode(nodeId);
        if (!cliResult.success) {
          return returnToolError(cliResult.error);
        }

        return returnToolSuccess(
          `Exit node set to: ${args.deviceId || "auto"}`,
        );
      }

      case "clear": {
        const cliResult = await context.cli.setExitNode();
        if (!cliResult.success) {
          return returnToolError(cliResult.error);
        }

        return returnToolSuccess("Exit node cleared successfully");
      }

      default:
        return returnToolError(
          "Invalid exit node operation. Use: list, set, clear, advertise",
        );
    }
  } catch (error) {
    logger.error("Error managing exit nodes:", error);
    return returnToolError(error);
  }
}

async function manageWebhooks(
  args: z.infer<typeof WebhookSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing webhooks:", args);

    switch (args.operation) {
      case "list": {
        const result = await context.api.listWebhooks();
        if (!result.success) {
          return returnToolError(result.error);
        }

        const webhooks = result.data?.webhooks || [];
        if (webhooks.length === 0) {
          return returnToolSuccess("No webhooks configured");
        }

        const webhookList = webhooks
          .map((webhook, index: number) => {
            return `**Webhook ${index + 1}**
  - ID: ${webhook.id}
  - URL: ${webhook.endpointUrl}
  - Events: ${webhook.events?.join(", ") || "None"}
  - Description: ${webhook.description || "No description"}
  - Created: ${webhook.createdAt}`;
          })
          .join("\n\n");

        return returnToolSuccess(
          `Found ${webhooks.length} webhooks:\n\n${webhookList}`,
        );
      }

      case "create": {
        if (!args.config) {
          return returnToolError(
            "Webhook configuration is required for create operation",
          );
        }

        const result = await context.api.createWebhook(args.config);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Webhook created successfully:
  - ID: ${result.data?.id}
  - URL: ${result.data?.endpointUrl}
  - Events: ${result.data?.events?.join(", ")}`,
        );
      }

      case "delete": {
        if (!args.webhookId) {
          return returnToolError("Webhook ID is required for delete operation");
        }

        const result = await context.api.deleteWebhook(args.webhookId);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Webhook ${args.webhookId} deleted successfully`,
        );
      }

      default:
        return returnToolError(
          "Invalid webhook operation. Use: list, create, or delete",
        );
    }
  } catch (error) {
    logger.error("Error managing webhooks:", error);
    return returnToolError(error);
  }
}

async function manageDeviceTags(
  args: z.infer<typeof DeviceTaggingSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing device tags:", args);

    switch (args.operation) {
      case "get_tags": {
        const result = await context.api.getDeviceTags(args.deviceId);
        if (!result.success) {
          return returnToolError(result.error);
        }

        const tags = result.data?.tags || [];
        return returnToolSuccess(
          `Device Tags for ${args.deviceId}:\n${
            tags.length > 0
              ? tags.map((tag) => `  - ${tag}`).join("\n")
              : "  No tags assigned"
          }`,
        );
      }

      case "set_tags": {
        if (!args.tags) {
          return returnToolError(
            "Tags array is required for set_tags operation",
          );
        }

        const result = await context.api.setDeviceTags(
          args.deviceId,
          args.tags,
        );
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Device tags updated to: ${args.tags.join(", ")}`,
        );
      }

      case "add_tags": {
        if (!args.tags) {
          return returnToolError(
            "Tags array is required for add_tags operation",
          );
        }

        // Get current tags first
        const currentResult = await context.api.getDeviceTags(args.deviceId);
        if (!currentResult.success) {
          return returnToolError(currentResult.error);
        }

        const currentTags = currentResult.data?.tags || [];
        const newTags = [...new Set([...currentTags, ...args.tags])];

        const result = await context.api.setDeviceTags(args.deviceId, newTags);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Added tags: ${args.tags.join(
            ", ",
          )}. Current tags: ${newTags.join(", ")}`,
        );
      }

      case "remove_tags": {
        if (!args.tags) {
          return returnToolError(
            "Tags array is required for remove_tags operation",
          );
        }

        // Get current tags first
        const currentResult = await context.api.getDeviceTags(args.deviceId);
        if (!currentResult.success) {
          return returnToolError(currentResult.error);
        }

        const currentTags = currentResult.data?.tags || [];
        const newTags = currentTags.filter((tag) => !args.tags?.includes(tag));

        const result = await context.api.setDeviceTags(args.deviceId, newTags);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Removed tags: ${args.tags.join(", ")}. Remaining tags: ${
            newTags.join(", ") || "None"
          }`,
        );
      }

      default:
        return returnToolError(
          "Invalid device tagging operation. Use: get_tags, set_tags, add_tags, or remove_tags",
        );
    }
  } catch (error) {
    logger.error("Error managing device tags:", error);
    return returnToolError(error);
  }
}

async function manageUsers(
  args: z.infer<typeof UserManagementSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    switch (args.operation) {
      case "list": {
        const result = await context.api.getUsers();
        if (!result.success) return returnToolError(result.error);
        const users = result.data?.users || [];
        if (users.length === 0) return returnToolSuccess("No users found");
        const list = users
          .map(
            (u, i) =>
              `**User ${i + 1}**\n  - ID: ${u.id}\n  - Login: ${u.loginName}\n  - Display: ${u.displayName}\n  - Role: ${u.role}\n  - Created: ${u.created}`,
          )
          .join("\n\n");
        return returnToolSuccess(`Found ${users.length} users:\n\n${list}`);
      }
      case "delete": {
        if (!args.userId)
          return returnToolError("userId is required for delete operation");
        const result = await context.api.deleteUser(args.userId);
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(`User ${args.userId} deleted successfully`);
      }
      default:
        return returnToolError("Invalid operation. Use: list or delete");
    }
  } catch (error) {
    logger.error("Error managing users:", error);
    return returnToolError(error);
  }
}

async function manageContacts(
  args: z.infer<typeof ContactsSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    switch (args.operation) {
      case "get": {
        const result = await context.api.getContacts();
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(
          `Tailnet Contacts:\n${JSON.stringify(result.data, null, 2)}`,
        );
      }
      case "update": {
        if (!args.contacts)
          return returnToolError("contacts is required for update operation");
        const result = await context.api.updateContacts(args.contacts);
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess("Contacts updated successfully");
      }
      default:
        return returnToolError("Invalid operation. Use: get or update");
    }
  } catch (error) {
    logger.error("Error managing contacts:", error);
    return returnToolError(error);
  }
}

async function manageLogStreams(
  args: z.infer<typeof LogStreamSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    switch (args.operation) {
      case "get": {
        const result = await context.api.getLogStream(args.logType);
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(
          `Log Stream (${args.logType}):\n${JSON.stringify(result.data, null, 2)}`,
        );
      }
      case "create": {
        if (!args.config)
          return returnToolError("config is required for create operation");
        const result = await context.api.createLogStream(
          args.logType,
          args.config,
        );
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(
          `Log stream created:\n${JSON.stringify(result.data, null, 2)}`,
        );
      }
      case "delete": {
        if (!args.streamId)
          return returnToolError("streamId is required for delete operation");
        const result = await context.api.deleteLogStream(
          args.logType,
          args.streamId,
        );
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(`Log stream ${args.streamId} deleted`);
      }
      default:
        return returnToolError(
          "Invalid operation. Use: get, create, or delete",
        );
    }
  } catch (error) {
    logger.error("Error managing log streams:", error);
    return returnToolError(error);
  }
}

async function manageDeviceAttributes(
  args: z.infer<typeof DeviceAttributesSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    switch (args.operation) {
      case "get": {
        const result = await context.api.getDeviceAttributes(args.deviceId);
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(
          `Device Attributes (${args.deviceId}):\n${JSON.stringify(result.data, null, 2)}`,
        );
      }
      case "set": {
        if (!args.key)
          return returnToolError("key is required for set operation");
        const result = await context.api.setDeviceAttribute(
          args.deviceId,
          args.key,
          args.value,
        );
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(
          `Attribute "${args.key}" set on device ${args.deviceId}`,
        );
      }
      case "delete": {
        if (!args.key)
          return returnToolError("key is required for delete operation");
        const result = await context.api.deleteDeviceAttribute(
          args.deviceId,
          args.key,
        );
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(
          `Attribute "${args.key}" deleted from device ${args.deviceId}`,
        );
      }
      default:
        return returnToolError("Invalid operation. Use: get, set, or delete");
    }
  } catch (error) {
    logger.error("Error managing device attributes:", error);
    return returnToolError(error);
  }
}

async function manageTailnetSettings(
  args: z.infer<typeof TailnetSettingsSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    switch (args.operation) {
      case "get": {
        const result = await context.api.getTailnetInfo();
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess(
          `Tailnet Settings:\n${JSON.stringify(result.data, null, 2)}`,
        );
      }
      case "update": {
        if (!args.settings)
          return returnToolError("settings is required for update operation");
        const result = await context.api.updateTailnetSettings(args.settings);
        if (!result.success) return returnToolError(result.error);
        return returnToolSuccess("Tailnet settings updated successfully");
      }
      default:
        return returnToolError("Invalid operation. Use: get or update");
    }
  } catch (error) {
    logger.error("Error managing tailnet settings:", error);
    return returnToolError(error);
  }
}

// Export the tool module
export const adminTools: ToolModule = {
  tools: [
    {
      name: "get_tailnet_info",
      description: "Get detailed Tailscale network information",
      inputSchema: TailnetInfoSchema,
      handler: getTailnetInfo,
    },
    {
      name: "manage_file_sharing",
      description: "Manage Tailscale file sharing settings",
      inputSchema: FileSharingSchema,
      handler: manageFileSharing,
    },
    {
      name: "manage_exit_nodes",
      description: "Manage Tailscale exit nodes and routing",
      inputSchema: ExitNodeSchema,
      handler: manageExitNodes,
    },
    {
      name: "manage_webhooks",
      description: "Manage Tailscale webhooks for event notifications",
      inputSchema: WebhookSchema,
      handler: manageWebhooks,
    },
    {
      name: "manage_device_tags",
      description: "Manage device tags for organization and ACL targeting",
      inputSchema: DeviceTaggingSchema,
      handler: manageDeviceTags,
    },
    {
      name: "manage_users",
      description: "Manage Tailscale tailnet users (list and delete)",
      inputSchema: UserManagementSchema,
      handler: manageUsers,
    },
    {
      name: "manage_contacts",
      description: "Manage Tailscale tailnet contacts (security, support)",
      inputSchema: ContactsSchema,
      handler: manageContacts,
    },
    {
      name: "manage_log_streams",
      description: "Manage Tailscale log streaming configuration",
      inputSchema: LogStreamSchema,
      handler: manageLogStreams,
    },
    {
      name: "manage_device_attributes",
      description: "Manage custom device posture attributes",
      inputSchema: DeviceAttributesSchema,
      handler: manageDeviceAttributes,
    },
    {
      name: "manage_tailnet_settings",
      description: "Get or update Tailscale tailnet settings",
      inputSchema: TailnetSettingsSchema,
      handler: manageTailnetSettings,
    },
  ],
};
