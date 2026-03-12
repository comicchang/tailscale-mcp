import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { ZodError } from "zod";
import { logger } from "../logger";
import {
  type ACLValidationResult,
  type AuthKeyList,
  type CreateAuthKeyRequest,
  type DeviceRoutes,
  type TailnetInfo,
  type TailscaleAPIResponse,
  type TailscaleConfig,
  type TailscaleDevice,
  TailscaleDeviceSchema,
  type UserList,
  type Webhook,
  type WebhookList,
} from "../types";
import { TailscaleOAuthManager } from "./oauth";

export type AuthMode = "api_key" | "oauth" | "none";

export class TailscaleAPI {
  private readonly client: AxiosInstance;
  private readonly tailnet: string;

  private readonly authMode: AuthMode;
  private readonly oauthManager: TailscaleOAuthManager | null = null;

  constructor(config: TailscaleConfig = {}) {
    const apiKey = config.apiKey || process.env.TAILSCALE_API_KEY;
    const oauthClientId =
      config.oauthClientId || process.env.TAILSCALE_OAUTH_CLIENT_ID;
    const oauthClientSecret =
      config.oauthClientSecret || process.env.TAILSCALE_OAUTH_CLIENT_SECRET;
    const tailnet = config.tailnet || process.env.TAILSCALE_TAILNET || "-";
    const baseUrl =
      config.apiBaseUrl ||
      process.env.TAILSCALE_API_BASE_URL ||
      "https://api.tailscale.com";

    // Determine auth mode
    if (oauthClientId && oauthClientSecret) {
      this.authMode = "oauth";
      this.oauthManager = new TailscaleOAuthManager({
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
        baseUrl,
      });
      logger.info(
        "Using OAuth authentication for Tailscale API (scoped permissions)",
      );
    } else if (apiKey) {
      this.authMode = "api_key";
      logger.debug("Using API key authentication for Tailscale API");
    } else {
      this.authMode = "none";
      logger.warn(
        "No Tailscale credentials provided. API operations will fail. Set TAILSCALE_API_KEY or TAILSCALE_OAUTH_CLIENT_ID/SECRET.",
      );
    }

    this.tailnet = tailnet;
    this.client = axios.create({
      timeout: 30000,
      baseURL: `${baseUrl}/api/v2`,
      headers: {
        // For API key auth, set static header; for OAuth, we'll set it dynamically
        Authorization:
          this.authMode === "api_key" && apiKey ? `Bearer ${apiKey}` : "",
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor for OAuth token injection and logging
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // Inject OAuth token if using OAuth auth
        if (this.authMode === "oauth" && this.oauthManager) {
          try {
            const token = await this.oauthManager.getAccessToken();
            config.headers.Authorization = `Bearer ${token}`;
          } catch (error) {
            logger.error("Failed to get OAuth token for request:", error);
            throw error;
          }
        }

        logger.debug(
          `API Request: ${config.method?.toUpperCase()} ${config.url}`,
        );
        return config;
      },
      (error) => {
        logger.error("API Request Error:", {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      },
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`API Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error("API Response Error:", {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data,
        });
        return Promise.reject(error);
      },
    );
  }

  /**
   * Get the current authentication mode
   */
  getAuthMode(): AuthMode {
    return this.authMode;
  }

  /**
   * Handle API response and convert to standardized format
   */
  private handleResponse<T>(
    response: AxiosResponse<T>,
  ): TailscaleAPIResponse<T> {
    return {
      success: true,
      data: response.data,
      statusCode: response.status,
    };
  }

  /**
   * Handle API errors and convert to standardized format
   */
  private handleError(error: unknown): TailscaleAPIResponse<never> {
    if (error instanceof AxiosError) {
      // API returned an error response
      const status = error.response?.status;
      const message =
        error.response?.data?.message ??
        error.response?.data?.error ??
        `HTTP ${status}`;

      return {
        success: false,
        error: message,
        statusCode: status,
      };
    }

    if (error instanceof Error) {
      // Network or other Error instance
      return {
        success: false,
        error:
          error.message || "Network error: Unable to connect to Tailscale API",
        statusCode: 0,
      };
    }

    // Unknown error type
    return {
      success: false,
      error: String(error) || "Unknown error occurred",
      statusCode: 0,
    };
  }

  /**
   * List all devices in the tailnet
   */
  async listDevices(): Promise<TailscaleAPIResponse<TailscaleDevice[]>> {
    try {
      // fields=all 确保返回 enabledRoutes、advertisedRoutes、clientConnectivity 等完整字段
      const response = await this.client.get<{ devices: TailscaleDevice[] }>(
        `/tailnet/${this.tailnet}/devices`,
        { params: { fields: "all" } },
      );

      // Validate and parse devices
      const devices = response.data.devices
        ?.map((device) => {
          try {
            return TailscaleDeviceSchema.parse(device);
          } catch (parseError) {
            logger.warn("Failed to parse device:", {
              device,
              error: parseError,
            });
            return null;
          }
        })
        .filter(
          (d: TailscaleDevice | null): d is TailscaleDevice => d !== null,
        );

      return this.handleResponse<TailscaleDevice[]>({
        data: devices,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config: response.config,
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get a specific device by ID
   */
  async getDevice(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<TailscaleDevice>> {
    try {
      const response = await this.client.get(`/device/${deviceId}`);
      const device = TailscaleDeviceSchema.parse(response.data);

      return this.handleResponse({ ...response, data: device });
    } catch (error) {
      if (error instanceof ZodError) {
        return {
          success: false,
          error: "Invalid device data received from API",
        };
      }
      return this.handleError(error);
    }
  }

  /**
   * Authorize a device
   */
  async authorizeDevice(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/device/${deviceId}/authorized`,
        {
          authorized: true,
        },
      );

      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Deauthorize a device
   */
  async deauthorizeDevice(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/device/${deviceId}/authorized`,
        {
          authorized: false,
        },
      );

      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete a device
   */
  async deleteDevice(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(`/device/${deviceId}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Expire device key
   */
  async expireDeviceKey(deviceId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(`/device/${deviceId}/expire`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Enable device routes
   */
  async enableDeviceRoutes(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(`/device/${deviceId}/routes`, {
        routes: routes,
      });

      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Disable device routes
   */
  /**
   * 禁用设备路由：获取当前已启用路由，移除指定路由，再用 POST 设置剩余路由
   */
  async disableDeviceRoutes(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const current = await this.getDeviceRoutes(deviceId);
      if (!current.success || !current.data) {
        return {
          success: false,
          error: current.error || "Failed to get current routes",
        };
      }
      const remaining = (current.data.enabledRoutes || []).filter(
        (r) => !routes.includes(r),
      );
      const response = await this.client.post(`/device/${deviceId}/routes`, {
        routes: remaining,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get tailnet information
   */
  async getTailnetInfo(): Promise<TailscaleAPIResponse<TailnetInfo>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/settings`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<TailscaleAPIResponse<{ status: string }>> {
    try {
      // TODO: Send a random request to the API to test connectivity
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/devices`,
      );
      return this.handleResponse({
        ...response,
        data: { status: "connected" },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get version information (API version info)
   * Note: This returns API version info, not CLI version
   */
  async getVersion(): Promise<
    TailscaleAPIResponse<{ version: string; apiVersion: string }>
  > {
    // Since there's no direct version endpoint, we'll return static API version info
    return {
      success: true,
      data: {
        version: "API v2",
        apiVersion: "2.0",
      },
      statusCode: 200,
    };
  }

  /**
   * Connect to network (API equivalent of CLI 'up')
   * Note: API doesn't directly support network connection, returns informational message
   */
  async connect(): Promise<TailscaleAPIResponse<{ message: string }>> {
    return {
      success: false,
      error:
        "Network connection is only available via CLI. Use the CLI 'up' command instead.",
      statusCode: 501,
    };
  }

  /**
   * Disconnect from network (API equivalent of CLI 'down')
   * Note: API doesn't directly support network disconnection, returns informational message
   */
  async disconnect(): Promise<TailscaleAPIResponse<{ message: string }>> {
    return {
      success: false,
      error:
        "Network disconnection is only available via CLI. Use the CLI 'down' command instead.",
      statusCode: 501,
    };
  }

  /**
   * Get ACL configuration
   */
  async getACL(): Promise<TailscaleAPIResponse<string>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/acl`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Update ACL configuration
   */
  async updateACL(aclConfig: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/acl`,
        aclConfig,
        {
          headers: {
            "Content-Type": "application/hujson",
          },
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Validate ACL configuration
   */
  async validateACL(
    aclConfig: string,
  ): Promise<TailscaleAPIResponse<ACLValidationResult>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/acl/validate`,
        aclConfig,
        {
          headers: {
            "Content-Type": "application/hujson",
          },
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get DNS nameservers
   */
  async getDNSNameservers(): Promise<TailscaleAPIResponse<{ dns: string[] }>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/dns/nameservers`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set DNS nameservers
   */
  async setDNSNameservers(
    nameservers: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/dns/nameservers`,
        {
          dns: nameservers,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get DNS preferences
   */
  async getDNSPreferences(): Promise<
    TailscaleAPIResponse<{ magicDNS: boolean }>
  > {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/dns/preferences`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set DNS preferences
   */
  async setDNSPreferences(
    magicDNS: boolean,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/dns/preferences`,
        {
          magicDNS,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get DNS search paths
   */
  async getDNSSearchPaths(): Promise<
    TailscaleAPIResponse<{ searchPaths: string[] }>
  > {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/dns/searchpaths`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set DNS search paths
   */
  async setDNSSearchPaths(
    searchPaths: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/dns/searchpaths`,
        {
          searchPaths,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List auth keys
   */
  async listAuthKeys(): Promise<TailscaleAPIResponse<AuthKeyList>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/keys`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Create auth key
   */
  async createAuthKey(
    keyConfig: CreateAuthKeyRequest,
  ): Promise<
    TailscaleAPIResponse<{ key: string; id: string; description?: string }>
  > {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/keys`,
        keyConfig,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete auth key
   */
  async deleteAuthKey(keyId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(
        `/tailnet/${this.tailnet}/keys/${keyId}`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get detailed tailnet information
   */
  async getDetailedTailnetInfo(): Promise<TailscaleAPIResponse<TailnetInfo>> {
    return this.getTailnetInfo();
  }

  /**
   * Get file sharing status for tailnet
   */
  async getFileSharingStatus(): Promise<
    TailscaleAPIResponse<{ fileSharing: boolean }>
  > {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/settings`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set file sharing status for tailnet
   */
  async setFileSharingStatus(
    enabled: boolean,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.patch(
        `/tailnet/${this.tailnet}/settings`,
        {
          fileSharing: enabled,
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set device as exit node
   */
  async setDeviceExitNode(
    deviceId: string,
    routes: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    return this.enableDeviceRoutes(deviceId, routes);
  }

  /**
   * Get device routes (including exit node status)
   */
  async getDeviceRoutes(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<DeviceRoutes>> {
    try {
      const response = await this.client.get(`/device/${deviceId}/routes`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 更新设备密钥属性（如禁用密钥过期）
   */
  async updateDeviceKey(
    deviceId: string,
    keyExpiryDisabled: boolean,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(`/device/${deviceId}/key`, {
        keyExpiryDisabled,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 为设备分配固定 IPv4 地址
   */
  async setDeviceIP(
    deviceId: string,
    ipv4: string,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(`/device/${deviceId}/ip`, {
        ipv4,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 更新 tailnet 设置（PATCH /tailnet/{tailnet}/settings）
   */
  async updateTailnetSettings(
    settings: Record<string, unknown>,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.patch(
        `/tailnet/${this.tailnet}/settings`,
        settings,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * List webhooks
   */
  async listWebhooks(): Promise<TailscaleAPIResponse<WebhookList>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/webhooks`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Create webhook
   */
  async createWebhook(config: {
    endpointUrl: string;
    secret?: string;
    events: string[];
    description?: string;
  }): Promise<TailscaleAPIResponse<Webhook>> {
    try {
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/webhooks`,
        config,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete webhook（路径不含 tailnet，对应 DELETE /webhook/{webhookId}）
   */
  async deleteWebhook(webhookId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(`/webhook/${webhookId}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 获取单个 webhook 详情（路径不含 tailnet，对应 GET /webhook/{webhookId}）
   */
  async getWebhook(webhookId: string): Promise<TailscaleAPIResponse<Webhook>> {
    try {
      const response = await this.client.get(`/webhook/${webhookId}`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get policy file (ACL in HuJSON format)
   */
  async getPolicyFile(): Promise<TailscaleAPIResponse<string>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/acl`, {
        headers: {
          Accept: "application/hujson",
        },
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 预览 ACL 访问规则（POST /acl/preview）
   * body: 完整的当前 policy（HuJSON 字符串）
   * query: type=src|dst, previewFor=<nodeId|ip|tag>
   */
  async previewACLAccess(
    policyContent: string,
    type: "src" | "dst" = "src",
    previewFor?: string,
  ): Promise<TailscaleAPIResponse<unknown>> {
    try {
      const params: Record<string, string> = { type };
      if (previewFor) params.previewFor = previewFor;
      const response = await this.client.post(
        `/tailnet/${this.tailnet}/acl/preview`,
        policyContent,
        {
          params,
          headers: { "Content-Type": "application/hujson" },
        },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get device tags
   */
  async getDeviceTags(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<{ tags: string[] }>> {
    try {
      const response = await this.client.get(`/device/${deviceId}`);
      const device = response.data;
      return this.handleResponse({
        ...response,
        data: { tags: device.tags || [] },
      });
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Set device tags
   */
  async setDeviceTags(
    deviceId: string,
    tags: string[],
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(`/device/${deviceId}/tags`, {
        tags: tags,
      });
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 获取 Split DNS 配置
   */
  async getSplitDNS(): Promise<TailscaleAPIResponse<Record<string, string[]>>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/dns/split-dns`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 设置 Split DNS 配置（覆盖全部）
   */
  async setSplitDNS(
    config: Record<string, string[]>,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.put(
        `/tailnet/${this.tailnet}/dns/split-dns`,
        config,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 部分更新 Split DNS 配置
   */
  async updateSplitDNS(
    config: Record<string, string[]>,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.patch(
        `/tailnet/${this.tailnet}/dns/split-dns`,
        config,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 获取 tailnet 联系人信息
   */
  async getContacts(): Promise<TailscaleAPIResponse<unknown>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/contacts`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 更新 tailnet 联系人信息
   */
  async updateContacts(
    contacts: Record<string, unknown>,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.patch(
        `/tailnet/${this.tailnet}/contacts`,
        contacts,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 列出 tailnet 用户
   */
  async getUsers(): Promise<TailscaleAPIResponse<UserList>> {
    try {
      const response = await this.client.get(`/tailnet/${this.tailnet}/users`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 删除用户
   */
  async deleteUser(userId: string): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(
        `/tailnet/${this.tailnet}/users/${userId}`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 获取日志流配置
   */
  async getLogStream(
    logType: "configuration" | "network",
  ): Promise<TailscaleAPIResponse<unknown>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/logging/${logType}/stream`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 创建/更新日志流配置（PUT，每个 logType 只允许一个 stream 配置）
   */
  async createLogStream(
    logType: "configuration" | "network",
    config: { destinationUrl: string; [key: string]: unknown },
  ): Promise<TailscaleAPIResponse<unknown>> {
    try {
      const response = await this.client.put(
        `/tailnet/${this.tailnet}/logging/${logType}/stream`,
        config,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 删除日志流配置（每个 logType 只有一个 stream，无需 streamId）
   */
  async deleteLogStream(
    logType: "configuration" | "network",
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(
        `/tailnet/${this.tailnet}/logging/${logType}/stream`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 获取设备自定义属性
   */
  async getDeviceAttributes(
    deviceId: string,
  ): Promise<TailscaleAPIResponse<unknown>> {
    try {
      const response = await this.client.get(`/device/${deviceId}/attributes`);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 设置设备自定义属性
   */
  async setDeviceAttribute(
    deviceId: string,
    key: string,
    value: unknown,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.post(
        `/device/${deviceId}/attributes/${key}`,
        { value },
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 删除设备自定义属性
   */
  async deleteDeviceAttribute(
    deviceId: string,
    key: string,
  ): Promise<TailscaleAPIResponse<void>> {
    try {
      const response = await this.client.delete(
        `/device/${deviceId}/attributes/${key}`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 获取认证密钥详情
   */
  async getAuthKey(keyId: string): Promise<TailscaleAPIResponse<unknown>> {
    try {
      const response = await this.client.get(
        `/tailnet/${this.tailnet}/keys/${keyId}`,
      );
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error);
    }
  }
}

// Export factory function for creating API instances
export function createTailscaleAPI(config: TailscaleConfig = {}): TailscaleAPI {
  return new TailscaleAPI(config);
}
